package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http/httptest"
	"testing"
)

type testFile struct {
	name    string
	content []byte
}

var (
	pngBytes = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 64)...)
	pdfOK    = []byte("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF")
	pdfBad   = []byte("%PDF-1.4\n1 0 obj << /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n%%EOF")
	exeBytes = append([]byte("MZ\x90\x00"), bytes.Repeat([]byte{1}, 128)...)
)

// multipartCall posts a form with files and returns the status and decoded JSON.
func (e *env_) multipartCall(path, token, field string, fields map[string]string, files ...testFile) (int, map[string]any) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for k, v := range fields {
		mw.WriteField(k, v)
	}
	for _, f := range files {
		fw, _ := mw.CreateFormFile(field, f.name)
		fw.Write(f.content)
	}
	mw.Close()
	req := httptest.NewRequest("POST", path, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	var out map[string]any
	json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func (e *env_) fileStatus(url, token string) int {
	req := httptest.NewRequest("GET", url, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	return rec.Code
}

func (e *env_) unread(token string) map[string]any {
	e.t.Helper()
	code, out := e.call("GET", "/api/unread", token, nil)
	return e.mustOK(code, out, 200)
}

// hiredPair is a client, a hired freelancer and an outsider on one contract.
func (e *env_) hiredPair() (client, dev, stranger string, jobID int, ms []int) {
	client, _ = e.signup("Client", "c@x.io")
	dev, _ = e.signup("Dev", "d@x.io")
	stranger, _ = e.signup("Stranger", "s@x.io")
	jobID, ms = e.postJob(client, nil)
	e.apply(jobID, dev)
	e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), client, map[string]int{"applicationId": id(e.apps(jobID, client)[0])})
	return
}

func TestChatAttachmentsAreCheckedAndPrivate(t *testing.T) {
	e := newEnv(t)
	client, dev, stranger, jobID, _ := e.hiredPair()
	path := fmt.Sprintf("/api/jobs/%d/messages", jobID)

	// Text and files in one message.
	code, out := e.multipartCall(path, dev, "files", map[string]string{"body": "Here is the mockup and the spec"},
		testFile{"mockup.png", pngBytes}, testFile{"spec.pdf", pdfOK})
	out = e.mustOK(code, out, 201)
	atts := out["attachments"].([]any)
	if len(atts) != 2 || atts[0].(map[string]any)["name"] != "mockup.png" || atts[0].(map[string]any)["mime"] != "image/png" {
		t.Fatalf("attachments: %v", atts)
	}
	url := atts[0].(map[string]any)["url"].(string)

	// A message may be only a file.
	code, out = e.multipartCall(path, dev, "files", nil, testFile{"notes.txt", []byte("plain notes")})
	e.mustOK(code, out, 201)

	// Dangerous or unsupported files are refused, as is too much at once.
	code, out = e.multipartCall(path, dev, "files", map[string]string{"body": "run this"}, testFile{"setup.exe", exeBytes})
	e.mustOK(code, out, 400)
	code, out = e.multipartCall(path, dev, "files", map[string]string{"body": "pdf"}, testFile{"evil.pdf", pdfBad})
	e.mustOK(code, out, 400)
	code, out = e.multipartCall(path, dev, "files", map[string]string{"body": "many"},
		testFile{"a.txt", []byte("a")}, testFile{"b.txt", []byte("b")}, testFile{"c.txt", []byte("c")}, testFile{"d.txt", []byte("d")})
	e.mustOK(code, out, 400)
	code, out = e.multipartCall(path, dev, "files", nil)
	e.mustOK(code, out, 400) // nothing to send
	var msgs int
	e.srv.db.QueryRow(`SELECT COUNT(*) FROM messages WHERE job_id = ?`, jobID).Scan(&msgs)
	if msgs != 2 {
		t.Fatalf("a refused message left rows behind: %d messages", msgs)
	}

	// Only the two parties can open the file.
	if e.fileStatus(url, client) != 200 || e.fileStatus(url, dev) != 200 {
		t.Fatal("participants cannot open the attachment")
	}
	if e.fileStatus(url, stranger) != 403 || e.fileStatus(url, "") != 403 {
		t.Fatalf("outsiders can open it: stranger %d anon %d", e.fileStatus(url, stranger), e.fileStatus(url, ""))
	}
	// Outsiders cannot read or write the conversation either.
	code, out = e.call("GET", path, stranger, nil)
	e.mustOK(code, out, 403)
	code, out = e.call("POST", path, stranger, map[string]string{"body": "hi"})
	e.mustOK(code, out, 403)
}

func TestArbiterCanReadAChatOnlyDuringADispute(t *testing.T) {
	e := newEnv(t)
	client, dev, _, jobID, ms := e.hiredPair()
	admin, _ := e.signup("Admin", "admin@x.io")
	path := fmt.Sprintf("/api/jobs/%d/messages", jobID)
	code, out := e.multipartCall(path, dev, "files", map[string]string{"body": "evidence"}, testFile{"proof.png", pngBytes})
	url := e.mustOK(code, out, 201)["attachments"].([]any)[0].(map[string]any)["url"].(string)

	code, out = e.call("GET", path, admin, nil)
	e.mustOK(code, out, 403)
	if e.fileStatus(url, admin) != 403 {
		t.Fatal("arbiter opened a chat file with no dispute")
	}

	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", ms[0]), client, nil)
	e.call("POST", fmt.Sprintf("/api/milestones/%d/dispute", ms[0]), client, map[string]string{"reason": "Not what we agreed on."})
	code, _ = e.call("GET", path, admin, nil)
	if code != 200 || e.fileStatus(url, admin) != 200 {
		t.Fatalf("arbiter cannot read the disputed chat: %d / file %d", code, e.fileStatus(url, admin))
	}
	code, out = e.call("POST", path, admin, map[string]string{"body": "I am reading this"})
	e.mustOK(code, out, 403) // read only
}

func TestUnreadCountsAndMessageNotifications(t *testing.T) {
	e := newEnv(t)
	client, dev, _, jobID, _ := e.hiredPair()
	path := fmt.Sprintf("/api/jobs/%d/messages", jobID)

	for i := 0; i < 3; i++ {
		code, out := e.call("POST", path, client, map[string]string{"body": fmt.Sprintf("message %d", i)})
		e.mustOK(code, out, 201)
	}
	u := e.unread(dev)
	if u["messages"].(float64) != 3 || u["jobs"].(map[string]any)[fmt.Sprint(jobID)].(float64) != 3 {
		t.Fatalf("freelancer unread: %v", u)
	}
	if e.unread(client)["messages"].(float64) != 0 {
		t.Fatal("senders must not see their own messages as unread")
	}
	// A burst is one notification, not three.
	code, out := e.call("GET", "/api/notifications", dev, nil)
	if code != 200 {
		t.Fatalf("notifications: %d %v", code, out)
	}
	var list []map[string]any
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/notifications", nil)
	req.Header.Set("Authorization", "Bearer "+dev)
	e.h.ServeHTTP(rec, req)
	json.Unmarshal(rec.Body.Bytes(), &list)
	chat := 0
	for _, n := range list {
		if n["kind"] == "message" {
			chat++
		}
	}
	if chat != 1 || e.unread(dev)["notifications"].(float64) < 1 {
		t.Fatalf("message notifications = %d: %v", chat, list)
	}

	// Opening the chat clears both.
	e.call("GET", path, dev, nil)
	u = e.unread(dev)
	if u["messages"].(float64) != 0 {
		t.Fatalf("unread after reading: %v", u)
	}
	var open int
	e.srv.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE user_id = 2 AND kind = 'message' AND read_at IS NULL`).Scan(&open)
	if open != 0 {
		t.Fatalf("%d message notifications still unread", open)
	}
	// A new message after reading creates a fresh alert.
	e.call("POST", path, client, map[string]string{"body": "one more"})
	if e.unread(dev)["messages"].(float64) != 1 {
		t.Fatal("new message not counted")
	}
}

func TestApplicationThreadAttachmentsAndBriefFiles(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")
	stranger, _ := e.signup("Stranger", "s@x.io")
	jobID, _ := e.postJob(client, nil)
	e.apply(jobID, dev)
	appID := id(e.apps(jobID, client)[0])

	path := fmt.Sprintf("/api/applications/%d/messages", appID)
	code, out := e.multipartCall(path, client, "files", map[string]string{"body": "Can you look at this brief first?"}, testFile{"brief.pdf", pdfOK})
	url := e.mustOK(code, out, 201)["attachments"].([]any)[0].(map[string]any)["url"].(string)
	if e.fileStatus(url, dev) != 200 || e.fileStatus(url, client) != 200 || e.fileStatus(url, stranger) != 403 {
		t.Fatal("application thread file access is wrong")
	}
	if e.unread(dev)["apps"].(map[string]any)[fmt.Sprint(appID)].(float64) != 1 {
		t.Fatalf("applicant unread: %v", e.unread(dev))
	}

	// Job brief files: only the client attaches; any signed-in user can open them; anonymous visitors cannot.
	bpath := fmt.Sprintf("/api/jobs/%d/attachments", jobID)
	code, out = e.multipartCall(bpath, stranger, "file", nil, testFile{"spec.pdf", pdfOK})
	e.mustOK(code, out, 403)
	code, out = e.multipartCall(bpath, client, "file", nil, testFile{"spec.pdf", pdfOK})
	out = e.mustOK(code, out, 201)
	files := out["attachments"].([]any)
	if len(files) != 1 {
		t.Fatalf("job attachments: %v", out["attachments"])
	}
	bf := files[0].(map[string]any)["url"].(string)
	if e.fileStatus(bf, stranger) != 200 || e.fileStatus(bf, "") != 403 {
		t.Fatalf("brief access: signed-in %d anonymous %d", e.fileStatus(bf, stranger), e.fileStatus(bf, ""))
	}
	// Visitors who are not signed in do not see the file list at all.
	_, anon := e.call("GET", fmt.Sprintf("/api/jobs/%d", jobID), "", nil)
	if anon["attachments"] != nil {
		t.Fatalf("anonymous visitor sees attachments: %v", anon["attachments"])
	}
}
