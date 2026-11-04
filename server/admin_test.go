package main

import (
	"fmt"
	"testing"
)

func TestReportsAndBans(t *testing.T) {
	e := newEnv(t)
	admin, _ := e.signup("Admin", "admin@x.io")
	client, clientID := e.signup("Client", "c@x.io")
	other, _ := e.signup("Other", "o@x.io")
	jobID, _ := e.postJob(client, nil)

	// Reports need a real target and a real reason.
	code, out := e.call("POST", "/api/reports", other, map[string]any{"kind": "job", "targetId": 9999, "reason": "This looks like a scam posting."})
	e.mustOK(code, out, 404)
	code, out = e.call("POST", "/api/reports", other, map[string]any{"kind": "job", "targetId": jobID, "reason": "bad"})
	e.mustOK(code, out, 400)
	code, out = e.call("POST", "/api/reports", other, map[string]any{"kind": "job", "targetId": jobID, "reason": "This looks like a scam posting."})
	e.mustOK(code, out, 201)

	// Only the platform team sees and handles them.
	code, out = e.call("GET", "/api/admin/reports", other, nil)
	e.mustOK(code, out, 403)
	code, list := e.callList("GET", "/api/admin/reports", admin)
	if code != 200 || len(list) != 1 || list[0]["targetName"] != "Build an escrow UI" || list[0]["reporter"] != "Other" {
		t.Fatalf("reports: %d %v", code, list)
	}
	var admins int
	e.srv.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE kind = 'report'`).Scan(&admins)
	if admins != 1 {
		t.Fatalf("admin notifications for the report: %d", admins)
	}

	// Suspending signs the person out everywhere, closes their postings and blocks login; restoring undoes it.
	code, out = e.call("POST", fmt.Sprintf("/api/admin/users/%d/ban", clientID), other, map[string]any{"banned": true})
	e.mustOK(code, out, 403)
	code, out = e.call("POST", fmt.Sprintf("/api/admin/users/%d/ban", clientID), admin, map[string]any{"banned": true, "reason": "Scam posting"})
	e.mustOK(code, out, 200)
	if code, _ := e.call("GET", "/api/auth/me", client, nil); code != 401 {
		t.Fatalf("suspended user still signed in: %d", code)
	}
	code, out = e.call("POST", "/api/auth/login", "", map[string]string{"email": "c@x.io", "password": "password123"})
	e.mustOK(code, out, 403)
	if list, _ := e.listJobs(""); len(list) != 0 {
		t.Fatal("a suspended user's posting is still public")
	}
	code, out = e.call("POST", "/api/admin/users/1/ban", admin, map[string]any{"banned": true}) // admin is user 1
	e.mustOK(code, out, 403)
	code, out = e.call("POST", fmt.Sprintf("/api/admin/users/%d/ban", clientID), admin, map[string]any{"banned": false})
	e.mustOK(code, out, 200)
	code, out = e.call("POST", "/api/auth/login", "", map[string]string{"email": "c@x.io", "password": "password123"})
	client = e.mustOK(code, out, 200)["token"].(string) // the old token died with the suspension

	rid := int(list[0]["id"].(float64))
	code, out = e.call("POST", fmt.Sprintf("/api/admin/reports/%d/resolve", rid), admin, map[string]string{"note": "Posting removed"})
	e.mustOK(code, out, 200)
	code, out = e.call("POST", fmt.Sprintf("/api/admin/reports/%d/resolve", rid), admin, nil)
	e.mustOK(code, out, 404) // already resolved

	// Removing a posting hides it from the board.
	job2, _ := e.postJob(client, nil)
	code, out = e.call("POST", fmt.Sprintf("/api/admin/jobs/%d/remove", job2), admin, nil)
	e.mustOK(code, out, 200)
	if list, _ := e.listJobs(""); len(list) != 0 {
		t.Fatalf("removed job still listed: %v", titles(list))
	}
}

func TestDashboardSummaries(t *testing.T) {
	e := newEnv(t)
	client, dev, _, jobID, ms := e.hiredPair()
	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", ms[0]), client, nil)
	e.call("POST", fmt.Sprintf("/api/milestones/%d/submit", ms[0]), dev, map[string]string{"deliverableUrl": "https://github.com/d/w"})
	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", ms[1]), client, nil) // 200 funded, waiting for work
	openJob, _ := e.postJob(client, map[string]any{"title": "Another open posting"})
	e.apply(openJob, dev)
	e.postJob(client, map[string]any{"title": "A saved draft", "draft": true})
	e.call("POST", fmt.Sprintf("/api/jobs/%d/messages", jobID), dev, map[string]string{"body": "How does it look?"})

	code, out := e.call("GET", "/api/dashboard", client, nil)
	out = e.mustOK(code, out, 200)
	sums := out["sums"].(map[string]any)
	if sums["escrow"].(map[string]any)["amount"].(float64) != 300_000_000 || sums["escrow"].(map[string]any)["count"].(float64) != 2 {
		t.Fatalf("client sums: %v", sums)
	}
	steps := map[string]bool{}
	for _, a := range out["actions"].([]any) {
		steps[a.(map[string]any)["step"].(string)] = true
	}
	if !steps["Review"] || !steps["Hire"] || !steps["Publish"] {
		t.Fatalf("client actions: %v", out["actions"])
	}
	if out["unread"].(map[string]any)["messages"].(float64) != 1 {
		t.Fatalf("client unread: %v", out["unread"])
	}
	var contract map[string]any
	for _, j := range out["jobs"].([]any) {
		if int(j.(map[string]any)["id"].(float64)) == jobID {
			contract = j.(map[string]any)
		}
	}
	if contract == nil || contract["role"] != "client" || contract["inEscrow"].(float64) != 300_000_000 || contract["counterpart"].(map[string]any)["name"] != "Dev" {
		t.Fatalf("contract row: %v", contract)
	}

	// The freelancer sees money to be earned, and an applicant row that carries no milestone money.
	code, out = e.call("GET", "/api/dashboard", dev, nil)
	out = e.mustOK(code, out, 200)
	steps = map[string]bool{}
	for _, a := range out["actions"].([]any) {
		steps[a.(map[string]any)["step"].(string)] = true
	}
	if !steps["Deliver"] {
		t.Fatalf("freelancer actions: %v", out["actions"])
	}
	for _, j := range out["jobs"].([]any) {
		if int(j.(map[string]any)["id"].(float64)) == openJob && j.(map[string]any)["role"] != "applicant" {
			t.Fatalf("applied job role: %v", j)
		}
	}

	// Nobody sees other people's data; an empty account gets an empty dashboard.
	other, _ := e.signup("Other", "o@x.io")
	code, out = e.call("GET", "/api/dashboard", other, nil)
	out = e.mustOK(code, out, 200)
	if len(out["jobs"].([]any)) != 0 || len(out["actions"].([]any)) != 0 {
		t.Fatalf("empty dashboard: %v", out)
	}
	if code, _ = e.call("GET", "/api/dashboard", "", nil); code != 401 {
		t.Fatalf("anonymous dashboard: %d", code)
	}
}

func TestPublicProfileShowsReviewsAndHealthReportsTheDatabase(t *testing.T) {
	e := newEnv(t)
	client, dev, _, jobID, ms := e.hiredPair()
	e.srv.db.Exec(`INSERT INTO developers (user_id, name, title, hourly_rate) VALUES (2, 'Dev', 'Solidity', 50)`)
	for _, m := range ms {
		e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", m), client, nil)
		e.call("POST", fmt.Sprintf("/api/milestones/%d/submit", m), dev, map[string]string{"deliverableUrl": "https://github.com/d/w"})
		e.call("POST", fmt.Sprintf("/api/milestones/%d/approve", m), client, nil)
	}
	e.call("POST", fmt.Sprintf("/api/jobs/%d/review", jobID), client, map[string]any{"rating": 5, "comment": "Great work, on time."})
	e.call("POST", fmt.Sprintf("/api/jobs/%d/review/reply", jobID), dev, map[string]string{"reply": "Thanks, a pleasure."})

	var devID int64
	e.srv.db.QueryRow(`SELECT id FROM developers WHERE user_id = 2`).Scan(&devID)
	code, out := e.call("GET", fmt.Sprintf("/api/developers/%d", devID), "", nil)
	out = e.mustOK(code, out, 200)
	revs := out["reviews"].([]any)
	if out["ratingCount"].(float64) != 1 || len(revs) != 1 || revs[0].(map[string]any)["comment"] != "Great work, on time." ||
		revs[0].(map[string]any)["reply"] != "Thanks, a pleasure." || revs[0].(map[string]any)["reviewer"] != "Client" {
		t.Fatalf("profile reviews: %v", out)
	}

	code, out = e.call("GET", "/api/health", "", nil)
	out = e.mustOK(code, out, 200)
	if out["status"] != "ok" || out["db"] != "ok" || out["version"] == "" {
		t.Fatalf("health: %v", out)
	}
}
