package main

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// Files are stored in Postgres rather than on disk: free hosts wipe the disk on every deploy, which
// silently lost profile photos. What a file is for decides who may open it:
//   avatar      anyone
//   resume      the applicant and the client they applied to
//   attachment  the people in that conversation (and the arbiter while a milestone is disputed)
//   brief       any signed-in user, once the job is published

type fileRule struct {
	max   int64
	mimes map[string]bool
}

var (
	imageMimes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true, "image/gif": true}
	docMimes   = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true, "image/gif": true,
		"application/pdf": true, "application/zip": true, "text/plain": true}
	fileRules = map[string]fileRule{
		"avatar":     {2 << 20, imageMimes},
		"resume":     {5 << 20, map[string]bool{"application/pdf": true}},
		"attachment": {10 << 20, docMimes},
		"brief":      {10 << 20, docMimes},
	}
	// PDFs that can run code or carry hidden payloads are refused. This is a basic check on the file's
	// structure, not an antivirus: compressed objects can hide these markers.
	activePDF = regexp.MustCompile(`/JavaScript|/JS\b|/Launch\b|/EmbeddedFiles?\b|/RichMedia\b`)
)

const maxResume = 5 << 20 // kept for the application form's request size

type dbExec interface {
	QueryRow(string, ...any) *sql.Row
}

// Attachment is how a stored file is described to the client.
type Attachment struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Mime string `json:"mime"`
	Size int    `json:"size"`
	URL  string `json:"url"`
}

// storeUpload reads one multipart file, checks its real type and size, and saves it.
func storeUpload(db dbExec, owner int64, kind string, f multipart.File, hdr *multipart.FileHeader) (int64, error) {
	defer f.Close()
	rule, ok := fileRules[kind]
	if !ok {
		return 0, errors.New("unknown file kind")
	}
	if hdr.Size > rule.max {
		return 0, fmt.Errorf("file must be under %d MB", rule.max>>20)
	}
	data, err := io.ReadAll(io.LimitReader(f, rule.max+1))
	if err != nil {
		return 0, err
	}
	if int64(len(data)) > rule.max {
		return 0, fmt.Errorf("file must be under %d MB", rule.max>>20)
	}
	mime := http.DetectContentType(data)
	if i := strings.Index(mime, ";"); i >= 0 {
		mime = mime[:i]
	}
	if !rule.mimes[mime] {
		switch kind {
		case "resume":
			return 0, errors.New("resume must be a PDF")
		case "avatar":
			return 0, errors.New("image must be JPEG, PNG, WebP or GIF")
		}
		return 0, errors.New("that file type is not allowed. Send images, PDF, ZIP or plain text files")
	}
	if mime == "application/pdf" && activePDF.Match(data) {
		return 0, errors.New("this PDF contains scripts or embedded files, so it was refused. Export a plain PDF and try again")
	}
	name := filepath.Base(hdr.Filename)
	if len(name) > 120 {
		name = name[:120]
	}
	return insertID(db, `INSERT INTO files (owner_id, kind, mime, name, data, size) VALUES (?,?,?,?,?,?)`, owner, kind, mime, name, data, len(data))
}

func fileURL(id int64) string { return "/api/files/" + strconv.FormatInt(id, 10) }

func attachmentOf(id int64, name, mime string, size int) Attachment {
	return Attachment{ID: id, Name: name, Mime: mime, Size: size, URL: fileURL(id)}
}

// handleGetFile serves a stored file to the people allowed to see it.
func (s *Server) handleGetFile(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var owner int64
	var kind, mime, name string
	var data []byte
	var msgID, jobID sql.NullInt64
	if err := s.db.QueryRow(`SELECT owner_id, kind, mime, name, data, message_id, job_id FROM files WHERE id = ?`, id).Scan(&owner, &kind, &mime, &name, &data, &msgID, &jobID); err != nil {
		writeErr(w, 404, "file not found")
		return
	}
	viewer := s.uidFromRequest(r)
	if !s.canSeeFile(viewer, kind, owner, id, msgID, jobID) {
		writeErr(w, 403, "You do not have access to this file")
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	disposition := "inline"
	if mime == "application/zip" {
		disposition = "attachment"
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf("%s; filename=%q", disposition, strings.ReplaceAll(name, `"`, "")))
	if kind == "avatar" {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		w.Header().Set("Cache-Control", "private, no-store")
	}
	w.Write(data)
}

func (s *Server) canSeeFile(viewer int64, kind string, owner, fileID int64, msgID, jobID sql.NullInt64) bool {
	if kind == "avatar" {
		return true
	}
	if viewer == 0 {
		return false
	}
	if viewer == owner {
		return true
	}
	switch kind {
	case "resume":
		return s.isAdminUser(viewer) || s.clientOfResume(viewer, fileID)
	case "brief":
		var status string
		var client int64
		if !jobID.Valid || s.db.QueryRow(`SELECT status, client_id FROM jobs WHERE id = ?`, jobID.Int64).Scan(&status, &client) != nil {
			return false
		}
		return status != "draft" || client == viewer
	case "attachment":
		if !msgID.Valid {
			return false
		}
		var job int64
		var app sql.NullInt64
		if s.db.QueryRow(`SELECT job_id, application_id FROM messages WHERE id = ?`, msgID.Int64).Scan(&job, &app) != nil {
			return false
		}
		if app.Valid {
			return s.inAppThread(viewer, app.Int64)
		}
		return s.canReadJobChat(job, viewer)
	}
	return false
}

func (s *Server) clientOfResume(viewer, fileID int64) bool {
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.resume_file_id = ? AND j.client_id = ?`, fileID, viewer).Scan(&n)
	return n > 0
}

// handleDeleteFile lets an owner remove a job-brief file.
func (s *Server) handleDeleteFile(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	res, err := s.db.Exec(`DELETE FROM files WHERE id = ? AND owner_id = ? AND kind = 'brief'`, id, uid)
	if err != nil {
		writeErr(w, 500, "could not delete the file")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, 404, "file not found")
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// handleJobAttachment adds a file (a spec, a design, a brief) to a job posting.
func (s *Server) handleJobAttachment(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var client int64
	if s.db.QueryRow(`SELECT client_id FROM jobs WHERE id = ?`, id).Scan(&client) != nil {
		writeErr(w, 404, "job not found")
		return
	}
	if client != uid {
		writeErr(w, 403, "Only the client can attach files to the job")
		return
	}
	var have int
	s.db.QueryRow(`SELECT COUNT(*) FROM files WHERE job_id = ? AND kind = 'brief'`, id).Scan(&have)
	if have >= 5 {
		writeErr(w, 409, "A job can have up to 5 files")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 11<<20)
	if err := r.ParseMultipartForm(11 << 20); err != nil {
		writeErr(w, 400, "The file is too large. The limit is 10 MB.")
		return
	}
	f, hdr, err := r.FormFile("file")
	if err != nil {
		writeErr(w, 400, "Choose a file to attach")
		return
	}
	fid, err := storeUpload(s.db, uid, "brief", f, hdr)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	s.db.Exec(`UPDATE files SET job_id = ? WHERE id = ?`, id, fid)
	s.writeJobDetail(w, 201, id, uid)
}

func (s *Server) jobAttachments(jobID int64) []Attachment {
	rows, err := s.db.Query(`SELECT id, name, mime, size FROM files WHERE job_id = ? AND kind = 'brief' ORDER BY id`, jobID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []Attachment
	for rows.Next() {
		var id int64
		var name, mime string
		var size int
		rows.Scan(&id, &name, &mime, &size)
		out = append(out, attachmentOf(id, name, mime, size))
	}
	return out
}
