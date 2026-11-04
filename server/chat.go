package main

import (
	"database/sql"
	"fmt"
	"mime/multipart"
	"net/http"
	"strings"
)

// Two kinds of conversation share one table:
//   job chat        client and hired freelancer, application_id IS NULL
//   application     client and one applicant, before anyone is hired
// Both take text and up to 3 attachments per message, and both keep a per-person "read up to" marker.

type Message struct {
	ID          int64        `json:"id"`
	Sender      Party        `json:"sender"`
	Body        string       `json:"body"`
	CreatedAt   string       `json:"createdAt"`
	Attachments []Attachment `json:"attachments"`
}

const maxFilesPerMessage = 3

func jobScope(id int64) string { return fmt.Sprintf("job:%d", id) }
func appScope(id int64) string { return fmt.Sprintf("app:%d", id) }

func (s *Server) isParticipant(jobID, uid int64) bool {
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM jobs WHERE id = ? AND (client_id = ? OR freelancer_id = ?)`, jobID, uid, uid).Scan(&n)
	return n > 0
}

// canReadJobChat: the two parties, plus the arbiter (read only) while a milestone of the job is disputed.
func (s *Server) canReadJobChat(jobID, uid int64) bool {
	if s.isParticipant(jobID, uid) {
		return true
	}
	if !s.isAdminUser(uid) {
		return false
	}
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM milestones WHERE job_id = ? AND status = 'disputed'`, jobID).Scan(&n)
	return n > 0
}

func (s *Server) inAppThread(uid, appID int64) bool {
	_, applicant, client, _, _, err := s.applicationAccess(appID)
	return err == nil && (uid == applicant || uid == client)
}

func (s *Server) markRead(uid int64, scope string, last int64) {
	s.db.Exec(`INSERT INTO chat_reads (user_id, scope, last_id) VALUES (?,?,?)
		ON CONFLICT (user_id, scope) DO UPDATE SET last_id = GREATEST(chat_reads.last_id, excluded.last_id)`, uid, scope, last)
}

func (s *Server) loadMessages(where string, args ...any) ([]Message, error) {
	rows, err := s.db.Query(`SELECT m.id, m.sender_id, u.name, m.body, m.created_at FROM messages m
		JOIN users u ON u.id = m.sender_id WHERE `+where+` ORDER BY m.id`, args...)
	if err != nil {
		return nil, err
	}
	out := []Message{}
	index := map[int64]int{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.Sender.ID, &m.Sender.Name, &m.Body, &m.CreatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		m.Attachments = []Attachment{}
		index[m.ID] = len(out)
		out = append(out, m)
	}
	rows.Close()
	if len(out) == 0 {
		return out, nil
	}
	ids := make([]string, 0, len(out))
	for _, m := range out {
		ids = append(ids, fmt.Sprint(m.ID))
	}
	frows, err := s.db.Query(`SELECT message_id, id, name, mime, size FROM files WHERE kind = 'attachment' AND message_id = ANY(?::bigint[]) ORDER BY id`, "{"+strings.Join(ids, ",")+"}")
	if err == nil {
		for frows.Next() {
			var mid, fid int64
			var name, mime string
			var size int
			frows.Scan(&mid, &fid, &name, &mime, &size)
			out[index[mid]].Attachments = append(out[index[mid]].Attachments, attachmentOf(fid, name, mime, size))
		}
		frows.Close()
	}
	return out, nil
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if !s.canReadJobChat(id, uid) {
		writeErr(w, 403, "Only the client and hired freelancer can read this chat")
		return
	}
	msgs, err := s.loadMessages(`m.job_id = ? AND m.application_id IS NULL`, id)
	if err != nil {
		writeErr(w, 500, "could not load messages")
		return
	}
	if n := len(msgs); n > 0 && s.isParticipant(id, uid) {
		s.markRead(uid, jobScope(id), msgs[n-1].ID)
		s.db.Exec(`UPDATE notifications SET read_at = now() WHERE user_id = ? AND job_id = ? AND kind = 'message' AND read_at IS NULL`, uid, id)
	}
	writeJSON(w, 200, msgs)
}

func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if !s.isParticipant(id, uid) {
		writeErr(w, 403, "Only the client and hired freelancer can post here")
		return
	}
	var client int64
	var freelancer sql.NullInt64
	s.db.QueryRow(`SELECT client_id, freelancer_id FROM jobs WHERE id = ?`, id).Scan(&client, &freelancer)
	other := client
	if uid == client {
		other = freelancer.Int64
	}
	s.postMessage(w, r, uid, id, nil, other)
}

// postMessage stores a message (JSON, or multipart when files are attached) and tells the other person.
func (s *Server) postMessage(w http.ResponseWriter, r *http.Request, uid, jobID int64, appID any, notify int64) {
	var body string
	var uploads []*uploadedFile
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		r.Body = http.MaxBytesReader(w, r.Body, int64(maxFilesPerMessage)*(10<<20)+(1<<20))
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			writeErr(w, 400, "The files are too large. The limit is 10 MB each.")
			return
		}
		body = r.FormValue("body")
		for _, hdr := range r.MultipartForm.File["files"] {
			f, err := hdr.Open()
			if err != nil {
				writeErr(w, 400, "could not read an attachment")
				return
			}
			uploads = append(uploads, &uploadedFile{f, hdr})
		}
		if len(uploads) > maxFilesPerMessage {
			writeErr(w, 400, fmt.Sprintf("Attach up to %d files per message", maxFilesPerMessage))
			return
		}
	} else {
		var b struct {
			Body string `json:"body"`
		}
		if decodeJSON(r, &b) != nil {
			writeErr(w, 400, "invalid request body")
			return
		}
		body = b.Body
	}
	body = strings.TrimSpace(body)
	if len(body) > 2000 || (body == "" && len(uploads) == 0) {
		writeErr(w, 400, "Write a message (up to 2000 characters) or attach a file")
		return
	}

	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not send message")
		return
	}
	defer tx.Rollback()
	mid, err := insertID(tx, `INSERT INTO messages (job_id, sender_id, body, application_id) VALUES (?,?,?,?)`, jobID, uid, body, appID)
	if err != nil {
		writeErr(w, 500, "could not send message")
		return
	}
	for _, u := range uploads {
		fid, err := storeUpload(tx, uid, "attachment", u.f, u.hdr)
		if err != nil {
			writeErr(w, 400, u.hdr.Filename+": "+err.Error())
			return
		}
		tx.Exec(`UPDATE files SET message_id = ? WHERE id = ?`, mid, fid)
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not send message")
		return
	}
	var sender string
	s.db.QueryRow(`SELECT name FROM users WHERE id = ?`, uid).Scan(&sender)
	s.notifyNewMessage(notify, jobID, sender, body, len(uploads))

	msgs, _ := s.loadMessages(`m.id = ?`, mid)
	if len(msgs) == 1 {
		writeJSON(w, 201, msgs[0])
		return
	}
	writeJSON(w, 201, map[string]int64{"id": mid})
}

type uploadedFile struct {
	f   multipart.File
	hdr *multipart.FileHeader
}
