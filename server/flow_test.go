package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http/httptest"
	"testing"
)

// postJob creates a job and returns its id and milestone ids.
func (e *env_) postJob(token string, extra map[string]any) (int, []int) {
	e.t.Helper()
	body := map[string]any{
		"title": "Build an escrow UI", "description": "A detailed description that is long enough.",
		"skills": []string{"React"}, "milestones": []map[string]any{{"title": "Design", "amount": 100}, {"title": "Build", "amount": 200}},
	}
	for k, v := range extra {
		body[k] = v
	}
	code, job := e.call("POST", "/api/jobs", token, body)
	e.mustOK(code, job, 201)
	var ms []int
	for _, m := range job["milestones"].([]any) {
		ms = append(ms, int(m.(map[string]any)["id"].(float64)))
	}
	return int(job["id"].(float64)), ms
}

func (e *env_) apply(jobID int, token string) map[string]any {
	e.t.Helper()
	code, out := e.call("POST", fmt.Sprintf("/api/jobs/%d/apply", jobID), token, map[string]any{
		"cover": "I have shipped three escrow dapps before.", "githubUrl": "https://github.com/dev/escrow", "bid": 280, "etaDays": 10,
	})
	return e.mustOK(code, out, 201)
}

func (e *env_) apps(jobID int, client string) []map[string]any {
	e.t.Helper()
	_, out := e.call("GET", fmt.Sprintf("/api/jobs/%d", jobID), client, nil)
	var list []map[string]any
	for _, a := range out["applications"].([]any) {
		list = append(list, a.(map[string]any))
	}
	return list
}

func id(m map[string]any) int { return int(m["id"].(float64)) }

func TestApplicationNeedsProofOfWorkAndTakesAResume(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")
	stranger, _ := e.signup("Stranger", "s@x.io")
	jobID, _ := e.postJob(client, nil)

	// A cover note alone is not enough, and the GitHub link must really be GitHub.
	code, out := e.call("POST", fmt.Sprintf("/api/jobs/%d/apply", jobID), dev, map[string]string{"cover": "I have shipped three escrow dapps before."})
	e.mustOK(code, out, 400)
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/apply", jobID), dev, map[string]string{"cover": "I have shipped three escrow dapps before.", "githubUrl": "https://evil.example/x"})
	e.mustOK(code, out, 400)

	// Multipart with a PDF resume. A file that is not a PDF is refused.
	send := func(content []byte) (int, map[string]any) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		mw.WriteField("cover", "I have shipped three escrow dapps before.")
		mw.WriteField("bid", "250")
		fw, _ := mw.CreateFormFile("resume", "cv.pdf")
		fw.Write(content)
		mw.Close()
		req := httptest.NewRequest("POST", fmt.Sprintf("/api/jobs/%d/apply", jobID), &buf)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+dev)
		rec := httptest.NewRecorder()
		e.h.ServeHTTP(rec, req)
		var o map[string]any
		json.Unmarshal(rec.Body.Bytes(), &o)
		return rec.Code, o
	}
	code, out = send([]byte("MZ not a pdf at all"))
	e.mustOK(code, out, 400)
	code, out = send([]byte("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF"))
	out = e.mustOK(code, out, 201)
	resume := out["myApplication"].(map[string]any)["resume"].(string)
	if out["myApplication"].(map[string]any)["bid"].(float64) != 250_000_000 {
		t.Fatalf("bid not stored in base units: %v", out["myApplication"])
	}

	get := func(token string) int {
		req := httptest.NewRequest("GET", resume, nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		e.h.ServeHTTP(rec, req)
		return rec.Code
	}
	if get(client) != 200 || get(dev) != 200 || get(stranger) != 403 || get("") != 403 {
		t.Fatalf("resume access: client %d dev %d stranger %d anon %d", get(client), get(dev), get(stranger), get(""))
	}

	// Closed postings stop taking applications and drop off the public board.
	e.srv.db.Exec(`UPDATE jobs SET closes_at = '2000-01-01T00:00:00Z' WHERE id = ?`, jobID)
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/apply", jobID), stranger, map[string]string{"cover": "I have shipped three escrow dapps before.", "githubUrl": "https://github.com/s/x"})
	e.mustOK(code, out, 409)
}

func TestShortlistDeclineWithdrawAndThread(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")
	other, _ := e.signup("Other", "o@x.io")
	jobID, _ := e.postJob(client, nil)
	e.apply(jobID, dev)
	e.apply(jobID, other)
	list := e.apps(jobID, client)
	a1, a2 := id(list[0]), id(list[1])

	code, out := e.call("POST", fmt.Sprintf("/api/applications/%d/status", a1), dev, map[string]string{"status": "shortlisted"})
	e.mustOK(code, out, 403)
	code, out = e.call("POST", fmt.Sprintf("/api/applications/%d/status", a1), client, map[string]string{"status": "shortlisted"})
	e.mustOK(code, out, 200)
	code, out = e.call("POST", fmt.Sprintf("/api/applications/%d/status", a2), client, map[string]string{"status": "declined"})
	e.mustOK(code, out, 200)

	// Client and applicant can talk before hiring; nobody else can read it.
	code, out = e.call("POST", fmt.Sprintf("/api/applications/%d/messages", a1), client, map[string]string{"body": "Can you start Monday?"})
	e.mustOK(code, out, 201)
	code, out = e.call("POST", fmt.Sprintf("/api/applications/%d/messages", a1), dev, map[string]string{"body": "Yes."})
	e.mustOK(code, out, 201)
	code, out = e.call("GET", fmt.Sprintf("/api/applications/%d/messages", a1), other, nil)
	e.mustOK(code, out, 403)
	// The pre-hire thread does not leak into the job chat.
	code, out = e.call("GET", fmt.Sprintf("/api/jobs/%d/messages", jobID), client, nil)
	if code != 200 {
		t.Fatalf("job chat: %d", code)
	}

	// A declined applicant can no longer withdraw; a shortlisted one can.
	code, out = e.call("DELETE", fmt.Sprintf("/api/applications/%d", a2), other, nil)
	e.mustOK(code, out, 409)
	code, out = e.call("DELETE", fmt.Sprintf("/api/applications/%d", a1), dev, nil)
	out = e.mustOK(code, out, 200)
	if out["myApplication"] != nil || out["applicants"].(float64) != 1 {
		t.Fatalf("withdraw left: applicants=%v mine=%v", out["applicants"], out["myApplication"])
	}
}

func TestSeveralOpeningsMakeSeparateContracts(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	devA, _ := e.signup("Alice", "a@x.io")
	devB, _ := e.signup("Bob", "b@x.io")
	devC, _ := e.signup("Cara", "k@x.io")
	jobID, _ := e.postJob(client, map[string]any{"openings": 2, "openDays": 7, "duration": "1 to 4 weeks", "level": "Expert"})
	for _, d := range []string{devA, devB, devC} {
		e.apply(jobID, d)
	}
	list := e.apps(jobID, client)

	code, out := e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), client, map[string]int{"applicationId": id(list[0])})
	out = e.mustOK(code, out, 200)
	if out["status"] != "open" || out["hired"].(float64) != 1 {
		t.Fatalf("after first hire: status %v hired %v", out["status"], out["hired"])
	}
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), client, map[string]int{"applicationId": id(list[1])})
	out = e.mustOK(code, out, 200)
	if out["status"] != "filled" || len(out["contracts"].([]any)) != 2 {
		t.Fatalf("after second hire: status %v contracts %v", out["status"], out["contracts"])
	}
	// The third applicant was declined automatically and cannot be hired.
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), client, map[string]int{"applicationId": id(list[2])})
	e.mustOK(code, out, 409)

	// Each contract carries its own copy of the milestones and the hired freelancer.
	contract := int(getJob(e, jobID, client)["contracts"].([]any)[0].(map[string]any)["id"].(float64))
	code, c := e.call("GET", fmt.Sprintf("/api/jobs/%d", contract), devA, nil)
	c = e.mustOK(code, c, 200)
	if c["viewerRole"] != "freelancer" || len(c["milestones"].([]any)) != 2 || c["parentId"].(float64) != float64(jobID) {
		t.Fatalf("contract: role %v milestones %v parent %v", c["viewerRole"], len(c["milestones"].([]any)), c["parentId"])
	}
	// The hired applicant's application points at their contract.
	code, p := e.call("GET", fmt.Sprintf("/api/jobs/%d", jobID), devA, nil)
	if got := p["myApplication"].(map[string]any)["contractId"]; got == nil || int(got.(float64)) != contract {
		t.Fatalf("contractId = %v, want %d", got, contract)
	}
}

func getJob(e *env_, jobID int, token string) map[string]any {
	_, o := e.call("GET", fmt.Sprintf("/api/jobs/%d", jobID), token, nil)
	return o
}

func TestRevisionReviewPrivacyAndCancel(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, devID := e.signup("Dev", "d@x.io")
	e.srv.db.Exec(`INSERT INTO developers (user_id, name, title, hourly_rate) VALUES (?, 'Dev', 'Solidity', 50)`, devID)
	jobID, ms := e.postJob(client, nil)
	e.apply(jobID, dev)
	appID := id(e.apps(jobID, client)[0])
	code, out := e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), client, map[string]int{"applicationId": appID})
	e.mustOK(code, out, 200)

	act := func(token string, m int, action string, body any, want int) map[string]any {
		t.Helper()
		c, o := e.call("POST", fmt.Sprintf("/api/milestones/%d/%s", m, action), token, body)
		return e.mustOK(c, o, want)
	}
	act(client, ms[0], "fund", nil, 200)
	act(dev, ms[0], "submit", map[string]string{"deliverableUrl": "https://github.com/dev/work", "note": "First pass"}, 200)

	// Outsiders see the milestone states but not the work or the notes.
	vis := getJob(e, jobID, "")["milestones"].([]any)[0].(map[string]any)
	if vis["deliverableUrl"] != nil || vis["submissionNote"] != "" {
		t.Fatalf("visitor sees private work: %v", vis)
	}

	// Request changes: needs an explanation, sends the milestone back to the freelancer.
	act(client, ms[0], "revise", map[string]string{"feedback": "no"}, 400)
	out = act(client, ms[0], "revise", map[string]string{"feedback": "Please add the mobile layout."}, 200)
	m := out["milestones"].([]any)[0].(map[string]any)
	if m["status"] != "funded" || m["revisions"].(float64) != 1 || m["feedback"] != "Please add the mobile layout." {
		t.Fatalf("after revise: %v", m)
	}
	act(dev, ms[0], "submit", map[string]string{"deliverableUrl": "https://github.com/dev/work2"}, 200)
	act(client, ms[0], "approve", nil, 200)

	// Money has moved, so the contract can no longer be cancelled.
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/cancel", jobID), client, nil)
	e.mustOK(code, out, 409)

	act(client, ms[1], "fund", nil, 200)
	act(dev, ms[1], "submit", map[string]string{"deliverableUrl": "https://github.com/dev/final"}, 200)
	out = act(client, ms[1], "approve", nil, 200)
	if out["status"] != "completed" {
		t.Fatalf("status %v", out["status"])
	}

	// Review: client only, once, and it sets the profile rating.
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/review", jobID), dev, map[string]any{"rating": 5})
	e.mustOK(code, out, 403)
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/review", jobID), client, map[string]any{"rating": 4, "comment": "Solid work."})
	out = e.mustOK(code, out, 200)
	code, _ = e.call("POST", fmt.Sprintf("/api/jobs/%d/review", jobID), client, map[string]any{"rating": 5})
	if code != 409 {
		t.Fatalf("second review: %d", code)
	}
	var rating float64
	e.srv.db.QueryRow(`SELECT rating FROM developers WHERE user_id = ?`, devID).Scan(&rating)
	if rating != 4 || out["review"].(map[string]any)["rating"].(float64) != 4 {
		t.Fatalf("rating = %v", rating)
	}
	if len(out["events"].([]any)) < 8 {
		t.Fatalf("activity log too short: %v", out["events"])
	}

	// A hired contract with nothing funded can still be called off.
	job2, _ := e.postJob(client, nil)
	e.apply(job2, dev)
	e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", job2), client, map[string]int{"applicationId": id(e.apps(job2, client)[0])})
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/cancel", job2), client, nil)
	if out = e.mustOK(code, out, 200); out["status"] != "cancelled" {
		t.Fatalf("cancel: %v", out["status"])
	}
}

func TestArbiterSeesDisputeQueue(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")
	admin, _ := e.signup("Admin", "admin@x.io")
	jobID, ms := e.postJob(client, nil)
	e.apply(jobID, dev)
	e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), client, map[string]int{"applicationId": id(e.apps(jobID, client)[0])})
	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", ms[0]), client, nil)
	code, out := e.call("POST", fmt.Sprintf("/api/milestones/%d/dispute", ms[0]), client, map[string]string{"reason": "Nothing was delivered on time."})
	e.mustOK(code, out, 200)

	req := httptest.NewRequest("GET", "/api/admin/disputes", nil)
	req.Header.Set("Authorization", "Bearer "+admin)
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != 200 || len(list) != 1 || list[0]["reason"] != "Nothing was delivered on time." {
		t.Fatalf("disputes: %d %s", rec.Code, rec.Body)
	}
	code, out = e.call("GET", "/api/admin/disputes", client, nil)
	e.mustOK(code, out, 403)
}
