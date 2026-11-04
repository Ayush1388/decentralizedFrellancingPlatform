package main

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"
)

func (e *env_) listJobs(query string) ([]map[string]any, string) {
	req := httptest.NewRequest("GET", "/api/jobs"+query, nil)
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	var out []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &out)
	return out, rec.Header().Get("X-Total-Count")
}

func titles(list []map[string]any) []string {
	var t []string
	for _, j := range list {
		t = append(t, j["title"].(string))
	}
	return t
}

func TestDraftsEditRepostAndExtend(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")

	// A draft is private and not on the board until published.
	jobID, _ := e.postJob(client, map[string]any{"draft": true, "category": "Frontend"})
	list, _ := e.listJobs("")
	if len(list) != 0 {
		t.Fatalf("draft visible on the public board: %v", titles(list))
	}
	if code, _ := e.call("GET", fmt.Sprintf("/api/jobs/%d", jobID), dev, nil); code != 404 {
		t.Fatalf("draft visible to another user: %d", code)
	}
	code, out := e.call("POST", fmt.Sprintf("/api/jobs/%d/apply", jobID), dev, map[string]string{"cover": "I would like to work on this please.", "githubUrl": "https://github.com/d/x"})
	e.mustOK(code, out, 409) // not open yet

	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/publish", jobID), client, nil)
	out = e.mustOK(code, out, 200)
	if out["status"] != "open" || out["closesAt"] == nil {
		t.Fatalf("publish: %v", out["status"])
	}
	if list, _ = e.listJobs(""); len(list) != 1 {
		t.Fatalf("published job missing from the board")
	}

	// Edit: text changes any time; milestones only while nobody applied.
	edit := func(extra map[string]any) (int, map[string]any) {
		body := map[string]any{"title": "Build an escrow UI v2", "description": "A detailed description that is long enough.", "skills": []string{"React"},
			"milestones": []map[string]any{{"title": "Design", "amount": 100}, {"title": "Build", "amount": 200}}}
		for k, v := range extra {
			body[k] = v
		}
		return e.call("PUT", fmt.Sprintf("/api/jobs/%d", jobID), client, body)
	}
	code, out = edit(map[string]any{"milestones": []map[string]any{{"title": "Everything", "amount": 500}}})
	out = e.mustOK(code, out, 200)
	if out["title"] != "Build an escrow UI v2" || out["total"].(float64) != 500_000_000 {
		t.Fatalf("edit: %v %v", out["title"], out["total"])
	}
	e.apply(jobID, dev)
	code, out = edit(map[string]any{"milestones": []map[string]any{{"title": "Something else", "amount": 700}}})
	e.mustOK(code, out, 409) // applicants applied against the old milestones
	code, out = edit(map[string]any{"description": "A changed description that is still long enough.", "milestones": []map[string]any{{"title": "Everything", "amount": 500}}})
	e.mustOK(code, out, 200)
	code, out = e.call("PUT", fmt.Sprintf("/api/jobs/%d", jobID), dev, map[string]any{"title": "Hijack the job", "description": "A detailed description that is long enough.", "milestones": []map[string]any{{"title": "x", "amount": 5}}})
	e.mustOK(code, out, 403)

	// An expired posting can be reopened by extending it.
	e.srv.db.Exec(`UPDATE jobs SET closes_at = now() - interval '1 day' WHERE id = ?`, jobID)
	if list, _ = e.listJobs(""); len(list) != 0 {
		t.Fatal("expired posting still listed")
	}
	code, out = edit(map[string]any{"milestones": []map[string]any{{"title": "Everything", "amount": 500}}, "extendDays": 7})
	e.mustOK(code, out, 200)
	if list, _ = e.listJobs(""); len(list) != 1 {
		t.Fatal("extended posting not listed again")
	}

	// Repost makes a fresh draft with the same brief and no applicants.
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/repost", jobID), client, nil)
	out = e.mustOK(code, out, 201)
	if out["status"] != "draft" || out["applicants"].(float64) != 0 || len(out["milestones"].([]any)) != 1 {
		t.Fatalf("repost: %v", out)
	}
}

func TestPublicBoardFiltersSortingPagingAndPrivacy(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")
	mk := func(title string, amount float64, extra map[string]any) int {
		x := map[string]any{"title": title, "milestones": []map[string]any{{"title": "All", "amount": amount}}}
		for k, v := range extra {
			x[k] = v
		}
		id, _ := e.postJob(client, x)
		return id
	}
	mk("Solidity audit for a vault", 3000, map[string]any{"category": "Security and audits", "level": "Expert", "skills": []string{"Solidity", "Audits"}})
	mk("React dashboard for vesting", 800, map[string]any{"category": "Frontend", "level": "Intermediate", "skills": []string{"React"}})
	mk("Logo and brand kit", 300, map[string]any{"category": "Design", "level": "Entry", "skills": []string{"Figma"}})
	private := mk("A private contract", 900, nil)
	e.apply(private, dev)
	e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", private), client, map[string]int{"applicationId": id(e.apps(private, client)[0])})

	list, total := e.listJobs("")
	if total != "4" && total != "3" {
		t.Fatalf("total = %s", total)
	}
	for _, j := range list {
		if j["title"] == "A private contract" {
			t.Fatal("a job in progress is listed publicly")
		}
	}
	check := func(q string, want ...string) {
		t.Helper()
		got, _ := e.listJobs(q)
		if fmt.Sprint(titles(got)) != fmt.Sprint(want) {
			t.Fatalf("%s -> %v, want %v", q, titles(got), want)
		}
	}
	check("?category=Frontend", "React dashboard for vesting")
	check("?level=Entry", "Logo and brand kit")
	check("?skill=solidity", "Solidity audit for a vault")
	check("?minBudget=500&maxBudget=1000", "React dashboard for vesting")
	check("?q=brand", "Logo and brand kit")
	check("?sort=budget_desc", "Solidity audit for a vault", "React dashboard for vesting", "Logo and brand kit")
	check("?sort=budget_asc&limit=2", "Logo and brand kit", "React dashboard for vesting")
	check("?sort=budget_asc&limit=2&page=2", "Solidity audit for a vault")
	if _, total := e.listJobs("?sort=budget_asc&limit=2"); total != "3" {
		t.Fatalf("X-Total-Count = %s, want 3", total)
	}
}

func TestHireAtTheAgreedPrice(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")
	jobID, _ := e.postJob(client, nil) // 100 + 200 = 300 USDC
	code, out := e.call("POST", fmt.Sprintf("/api/jobs/%d/apply", jobID), dev, map[string]any{"cover": "I can do this for less money.", "githubUrl": "https://github.com/d/x", "bid": 250})
	e.mustOK(code, out, 201)
	app := id(e.apps(jobID, client)[0])

	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), client, map[string]any{"applicationId": app, "useQuote": true})
	out = e.mustOK(code, out, 200)
	ms := out["milestones"].([]any)
	a, b := ms[0].(map[string]any)["amount"].(float64), ms[1].(map[string]any)["amount"].(float64)
	if a+b != 250_000_000 || a != 83_333_333 {
		t.Fatalf("scaled milestones %v + %v", a, b) // 100/300 of 250 USDC, the rest on the last one
	}
	if out["total"].(float64) != 250_000_000 {
		t.Fatalf("total %v", out["total"])
	}

	// Without the quote the posted budget stands; a missing quote cannot be used.
	job2, _ := e.postJob(client, nil)
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/apply", job2), dev, map[string]any{"cover": "I can do this for the posted price.", "githubUrl": "https://github.com/d/x"}) // no quote
	e.mustOK(code, out, 201)
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", job2), client, map[string]any{"applicationId": id(e.apps(job2, client)[0]), "useQuote": true})
	e.mustOK(code, out, 400)
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", job2), client, map[string]any{"applicationId": id(e.apps(job2, client)[0])})
	if e.mustOK(code, out, 200)["total"].(float64) != 300_000_000 {
		t.Fatalf("posted budget changed: %v", out["total"])
	}
}

func TestRenegotiateBeforeFundingThenFollowUpAfter(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")
	jobID, ms := e.postJob(client, nil)
	e.apply(jobID, dev)
	e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), client, map[string]int{"applicationId": id(e.apps(jobID, client)[0])})

	path := fmt.Sprintf("/api/jobs/%d/milestones", jobID)
	code, out := e.call("PUT", path, dev, map[string]any{"milestones": []map[string]any{{"title": "x", "amount": 5}}})
	e.mustOK(code, out, 403)
	code, out = e.call("PUT", path, client, map[string]any{"milestones": []map[string]any{{"title": "Design", "amount": 150}, {"title": "Build", "amount": 250}, {"title": "Launch", "amount": 50}}})
	out = e.mustOK(code, out, 200)
	if len(out["milestones"].([]any)) != 3 || out["total"].(float64) != 450_000_000 {
		t.Fatalf("renegotiated: %v", out["total"])
	}
	newIDs := []int{}
	for _, m := range out["milestones"].([]any) {
		newIDs = append(newIDs, id(m.(map[string]any)))
	}
	_ = ms

	// Once something is funded the milestones are locked.
	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", newIDs[0]), client, nil)
	code, out = e.call("PUT", path, client, map[string]any{"milestones": []map[string]any{{"title": "Other", "amount": 10}}})
	e.mustOK(code, out, 409)

	// New work becomes its own contract with the same freelancer.
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/followup", jobID), client, map[string]any{"title": "Bonus for great work", "milestones": []map[string]any{{"title": "Bonus", "amount": 40}}})
	out = e.mustOK(code, out, 201)
	if out["status"] != "in_progress" || out["freelancer"].(map[string]any)["name"] != "Dev" || int(out["parentId"].(float64)) != jobID || out["milestones"].([]any)[0].(map[string]any)["status"] != "pending" {
		t.Fatalf("follow-up: %v", out)
	}
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/followup", jobID), dev, map[string]any{"title": "Give me a bonus", "milestones": []map[string]any{{"title": "Bonus", "amount": 40}}})
	e.mustOK(code, out, 403)
}

func TestStaleDisputeCanBeSettledFiftyFifty(t *testing.T) {
	e := newEnv(t)
	client, dev, stranger, jobID, ms := e.hiredPair()
	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", ms[0]), client, nil)
	e.call("POST", fmt.Sprintf("/api/milestones/%d/dispute", ms[0]), dev, map[string]string{"reason": "The client has gone quiet on me."})

	path := fmt.Sprintf("/api/milestones/%d/resolve-stale", ms[0])
	code, out := e.call("POST", path, client, nil)
	e.mustOK(code, out, 409) // the arbiter still has time
	_, job := e.call("GET", fmt.Sprintf("/api/jobs/%d", jobID), client, nil)
	if job["milestones"].([]any)[0].(map[string]any)["settleAt"] == nil {
		t.Fatal("settleAt not shown on a disputed milestone")
	}

	e.srv.db.Exec(`UPDATE milestones SET disputed_at = now() - interval '31 days' WHERE id = ?`, ms[0])
	code, out = e.call("POST", path, stranger, nil)
	e.mustOK(code, out, 403)
	code, out = e.call("POST", path, dev, nil)
	out = e.mustOK(code, out, 200)
	m := out["milestones"].([]any)[0].(map[string]any)
	if m["status"] != "resolved" || m["freelancerBps"].(float64) != 5000 {
		t.Fatalf("settled milestone: %v", m)
	}
	code, out = e.call("POST", path, dev, nil)
	e.mustOK(code, out, 409)
}

func TestReviewsBothWaysWithRepliesAndNoReviewWithoutPayment(t *testing.T) {
	e := newEnv(t)
	client, dev, _, jobID, ms := e.hiredPair()
	e.srv.db.Exec(`INSERT INTO developers (user_id, name, title, hourly_rate) VALUES (2, 'Dev', 'Solidity', 50)`)
	review := func(token string, rating int) (int, map[string]any) {
		return e.call("POST", fmt.Sprintf("/api/jobs/%d/review", jobID), token, map[string]any{"rating": rating, "comment": "ok"})
	}

	// A contract that ends in refunds has no payout: it is not a completed job on the record, and cannot be reviewed.
	for _, m := range ms {
		e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", m), client, nil)
	}
	e.srv.db.Exec(`UPDATE milestones SET funded_at = now() - interval '20 days' WHERE job_id = ?`, jobID)
	for _, m := range ms {
		code, out := e.call("POST", fmt.Sprintf("/api/milestones/%d/refund", m), client, nil)
		e.mustOK(code, out, 200)
	}
	var done int
	e.srv.db.QueryRow(`SELECT jobs_done FROM developers WHERE user_id = 2`).Scan(&done)
	if done != 0 {
		t.Fatalf("a refunded job counted as a completed job: jobs_done = %d", done)
	}
	if code, _ := review(client, 5); code != 409 {
		t.Fatalf("reviewing an unpaid job: %d", code)
	}

	// A paid job: both sides review once, the reviewed side may reply once.
	job2, ms2 := e.postJob(client, nil)
	e.apply(job2, dev)
	e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", job2), client, map[string]int{"applicationId": id(e.apps(job2, client)[0])})
	for _, m := range ms2 {
		e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", m), client, nil)
		e.call("POST", fmt.Sprintf("/api/milestones/%d/submit", m), dev, map[string]string{"deliverableUrl": "https://github.com/d/w"})
		e.call("POST", fmt.Sprintf("/api/milestones/%d/approve", m), client, nil)
	}
	e.srv.db.QueryRow(`SELECT jobs_done FROM developers WHERE user_id = 2`).Scan(&done)
	if done != 1 {
		t.Fatalf("jobs_done = %d after a paid job", done)
	}
	rv := func(token string, rating int) (int, map[string]any) {
		return e.call("POST", fmt.Sprintf("/api/jobs/%d/review", job2), token, map[string]any{"rating": rating, "comment": "ok"})
	}
	code, out := rv(client, 4)
	e.mustOK(code, out, 200)
	code, out = rv(dev, 5)
	out = e.mustOK(code, out, 200)
	if len(out["reviews"].([]any)) != 2 || out["clientRating"].(float64) != 5 || out["clientReviews"].(float64) != 1 {
		t.Fatalf("reviews: %v rating %v", out["reviews"], out["clientRating"])
	}
	if code, _ := rv(dev, 1); code != 409 {
		t.Fatalf("second review by the same side: %d", code)
	}
	reply := fmt.Sprintf("/api/jobs/%d/review/reply", job2)
	code, out = e.call("POST", reply, client, map[string]string{"reply": "Thank you!"})
	e.mustOK(code, out, 200)
	code, out = e.call("POST", reply, client, map[string]string{"reply": "And again!"})
	e.mustOK(code, out, 409) // one reply only
	var rating float64
	e.srv.db.QueryRow(`SELECT rating FROM developers WHERE user_id = 2`).Scan(&rating)
	if rating != 4 {
		t.Fatalf("freelancer rating = %v, want the client's 4", rating)
	}
}

func TestSavedJobs(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")
	jobID, _ := e.postJob(client, nil)
	code, out := e.call("POST", fmt.Sprintf("/api/jobs/%d/save", jobID), dev, nil)
	e.mustOK(code, out, 200)
	e.call("POST", fmt.Sprintf("/api/jobs/%d/save", jobID), dev, nil) // saving twice is harmless
	req := httptest.NewRequest("GET", "/api/saved-ids", nil)
	req.Header.Set("Authorization", "Bearer "+dev)
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	var ids []int
	json.Unmarshal(rec.Body.Bytes(), &ids)
	if len(ids) != 1 || ids[0] != jobID {
		t.Fatalf("saved ids: %v", ids)
	}
	req = httptest.NewRequest("GET", "/api/jobs/saved", nil)
	req.Header.Set("Authorization", "Bearer "+dev)
	rec = httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Fatalf("saved list: %s", rec.Body)
	}
	e.call("DELETE", fmt.Sprintf("/api/jobs/%d/save", jobID), dev, nil)
	rec = httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list) != 0 {
		t.Fatal("job still saved after removing it")
	}
}
