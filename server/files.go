package main

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
)

// Files are stored in Postgres rather than on disk: free hosts wipe the disk on
// every deploy, which silently lost profile photos. Avatars are public; resumes
// are only served to their owner and to clients of jobs they applied to.

const (
	maxAvatar = 2 << 20
	maxResume = 5 << 20
)

type dbExec interface {
	QueryRow(string, ...any) *sql.Row
}

// storeUpload reads one multipart file, checks its real type and size, and saves it.
// It returns 0 and no error when the field was left empty.
func storeUpload(db dbExec, owner int64, kind string, f multipart.File, hdr *multipart.FileHeader) (int64, error) {
	defer f.Close()
	limit, allowed := int64(maxAvatar), map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true, "image/gif": true}
	if kind == "resume" {
		limit, allowed = maxResume, map[string]bool{"application/pdf": true}
	}
	if hdr.Size > limit {
		return 0, fmt.Errorf("file must be under %d MB", limit>>20)
	}
	data, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil {
		return 0, err
	}
	if int64(len(data)) > limit {
		return 0, fmt.Errorf("file must be under %d MB", limit>>20)
	}
	mime := http.DetectContentType(data)
	if !allowed[mime] {
		if kind == "resume" {
			return 0, errors.New("resume must be a PDF")
		}
		return 0, errors.New("image must be JPEG, PNG, WebP or GIF")
	}
	name := filepath.Base(hdr.Filename)
	if len(name) > 120 {
		name = name[:120]
	}
	return insertID(db, `INSERT INTO files (owner_id, kind, mime, name, data) VALUES (?,?,?,?,?)`, owner, kind, mime, name, data)
}

func fileURL(id int64) string { return "/api/files/" + strconv.FormatInt(id, 10) }

// handleGetFile serves avatars to anyone and resumes only to people allowed to see them.
func (s *Server) handleGetFile(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var owner int64
	var kind, mime, name string
	var data []byte
	if err := s.db.QueryRow(`SELECT owner_id, kind, mime, name, data FROM files WHERE id = ?`, id).Scan(&owner, &kind, &mime, &name, &data); err != nil {
		writeErr(w, 404, "file not found")
		return
	}
	if kind == "resume" && !s.canSeeResume(s.uidFromRequest(r), owner, id) {
		writeErr(w, 403, "Only the applicant and the client they applied to can open this resume")
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if kind == "resume" {
		w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", strings.ReplaceAll(name, `"`, "")))
		w.Header().Set("Cache-Control", "private, no-store")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	w.Write(data)
}

func (s *Server) canSeeResume(viewer, owner, fileID int64) bool {
	if viewer == 0 {
		return false
	}
	if viewer == owner || s.isAdminUser(viewer) {
		return true
	}
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.resume_file_id = ? AND j.client_id = ?`, fileID, viewer).Scan(&n)
	return n > 0
}
