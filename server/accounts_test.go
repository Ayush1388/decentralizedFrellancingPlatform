package main

import (
	"fmt"
	"regexp"
	"strings"
	"testing"
)

var tokenRe = regexp.MustCompile(`token=([0-9a-f]+)`)

func lastToken(t *testing.T, m sentMail) string {
	t.Helper()
	g := tokenRe.FindStringSubmatch(m.body)
	if g == nil {
		t.Fatalf("no token in email: %q", m.body)
	}
	return g[1]
}

func TestSignupNeedsTermsAndVerifiedEmail(t *testing.T) {
	e := newEnv(t)
	fm := &fakeMailer{}
	e.srv.mailer = fm
	e.srv.cfg.FrontendURL = "https://site.example"

	code, out := e.call("POST", "/api/auth/signup", "", map[string]any{"name": "Nora", "email": "n@x.io", "password": "password123"})
	e.mustOK(code, out, 400) // terms not accepted

	code, out = e.call("POST", "/api/auth/signup", "", map[string]any{"name": "Nora", "email": "n@x.io", "password": "password123", "acceptTerms": true})
	out = e.mustOK(code, out, 201)
	token := out["token"].(string)
	if out["user"].(map[string]any)["emailVerified"] != false {
		t.Fatalf("new account should start unverified: %v", out["user"])
	}
	mail := onlyTo(t, fm.take(), "n@x.io")
	if !strings.Contains(mail.body, "https://site.example/verify?token=") {
		t.Fatalf("verification email: %q", mail.body)
	}

	// Unverified accounts cannot post jobs or apply.
	body := map[string]any{"title": "Build an escrow UI", "description": "A detailed description that is long enough.", "milestones": []map[string]any{{"title": "One", "amount": 10}}}
	code, out = e.call("POST", "/api/jobs", token, body)
	e.mustOK(code, out, 403)

	// A wrong or reused token fails; the right one unlocks the account.
	code, out = e.call("POST", "/api/auth/verify", "", map[string]string{"token": "deadbeef"})
	e.mustOK(code, out, 400)
	tok := lastToken(t, mail)
	code, out = e.call("POST", "/api/auth/verify", "", map[string]string{"token": tok})
	e.mustOK(code, out, 200)
	code, out = e.call("POST", "/api/auth/verify", "", map[string]string{"token": tok})
	e.mustOK(code, out, 400) // single use
	code, out = e.call("POST", "/api/jobs", token, body)
	e.mustOK(code, out, 201)
}

func TestForgotAndResetPassword(t *testing.T) {
	e := newEnv(t)
	fm := &fakeMailer{}
	e.srv.mailer = fm
	e.srv.cfg.AdminEmails = nil

	code, out := e.call("POST", "/api/auth/signup", "", map[string]any{"name": "Nora", "email": "n@x.io", "password": "password123", "acceptTerms": true})
	oldToken := e.mustOK(code, out, 201)["token"].(string)
	fm.take()

	// Unknown addresses get the same answer and no email.
	code, out = e.call("POST", "/api/auth/forgot", "", map[string]string{"email": "nobody@x.io"})
	e.mustOK(code, out, 200)
	if got := fm.take(); len(got) != 0 {
		t.Fatalf("email sent for unknown address: %+v", got)
	}

	code, out = e.call("POST", "/api/auth/forgot", "", map[string]string{"email": "n@x.io"})
	e.mustOK(code, out, 200)
	tok := lastToken(t, onlyTo(t, fm.take(), "n@x.io"))

	code, out = e.call("POST", "/api/auth/reset", "", map[string]string{"token": tok, "password": "short"})
	e.mustOK(code, out, 400)
	code, out = e.call("POST", "/api/auth/reset", "", map[string]string{"token": tok, "password": "a-brand-new-pass"})
	out = e.mustOK(code, out, 200)
	newToken := out["token"].(string)
	code, out = e.call("POST", "/api/auth/reset", "", map[string]string{"token": tok, "password": "another-new-pass"})
	e.mustOK(code, out, 400) // single use

	// Old password and old sessions are dead; the new ones work.
	code, out = e.call("POST", "/api/auth/login", "", map[string]string{"email": "n@x.io", "password": "password123"})
	e.mustOK(code, out, 401)
	code, out = e.call("POST", "/api/auth/login", "", map[string]string{"email": "n@x.io", "password": "a-brand-new-pass"})
	e.mustOK(code, out, 200)
	code, out = e.call("GET", "/api/auth/me", oldToken, nil)
	e.mustOK(code, out, 401)
	code, out = e.call("GET", "/api/auth/me", newToken, nil)
	e.mustOK(code, out, 200)
}

func TestPasswordChangeAndLogoutEverywhere(t *testing.T) {
	e := newEnv(t)
	tokA, _ := e.signup("Nora", "n@x.io")
	code, out := e.call("POST", "/api/auth/password", tokA, map[string]string{"current": "wrong-password", "next": "a-brand-new-pass"})
	e.mustOK(code, out, 403)
	code, out = e.call("POST", "/api/auth/password", tokA, map[string]string{"current": "password123", "next": "a-brand-new-pass"})
	out = e.mustOK(code, out, 200)
	tokB := out["token"].(string)
	if code, _ = e.call("GET", "/api/auth/me", tokA, nil); code != 401 {
		t.Fatalf("old session still works after a password change: %d", code)
	}
	code, out = e.call("POST", "/api/auth/logout-all", tokB, nil)
	e.mustOK(code, out, 200)
	if code, _ = e.call("GET", "/api/auth/me", tokB, nil); code != 401 {
		t.Fatalf("session survived logout everywhere: %d", code)
	}
}

func TestLoginGuessingIsRateLimited(t *testing.T) {
	e := newEnv(t)
	e.srv.cfg.NoRateLimit = false
	e.signup("Nora", "n@x.io")
	var last int
	for i := 0; i < 12; i++ {
		last, _ = e.call("POST", "/api/auth/login", "", map[string]string{"email": "n@x.io", "password": fmt.Sprintf("guess-%d-wrong", i)})
		if last == 429 {
			if i < 7 {
				t.Fatalf("limited too early, after %d attempts", i)
			}
			break
		}
	}
	if last != 429 {
		t.Fatal("never rate limited")
	}
	// Even the right password is refused while limited.
	if code, _ := e.call("POST", "/api/auth/login", "", map[string]string{"email": "n@x.io", "password": "password123"}); code != 429 {
		t.Fatalf("correct password during lockout: %d", code)
	}
}

func TestExportAndDeleteAccount(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, devID := e.signup("Dev", "d@x.io")
	e.srv.db.Exec(`INSERT INTO developers (user_id, name, title, hourly_rate) VALUES (?, 'Dev', 'Solidity', 50)`, devID)
	jobID, ms := e.postJob(client, nil)
	e.apply(jobID, dev)
	e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), client, map[string]int{"applicationId": id(e.apps(jobID, client)[0])})
	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", ms[0]), client, nil)

	code, out := e.call("GET", "/api/auth/export", dev, nil)
	out = e.mustOK(code, out, 200)
	if len(out["applications"].([]any)) != 1 || len(out["jobsAsFreelancer"].([]any)) != 1 || out["account"].(map[string]any)["email"] != "d@x.io" {
		t.Fatalf("export: %v", out)
	}

	// Money is in escrow on an unfinished contract: deleting would strand it.
	code, out = e.call("POST", "/api/auth/delete", dev, map[string]string{"password": "password123", "confirm": "DELETE"})
	e.mustOK(code, out, 409)

	// Finish the contract, then deletion works and wipes the personal data but keeps the job history.
	e.call("POST", fmt.Sprintf("/api/milestones/%d/submit", ms[0]), dev, map[string]string{"deliverableUrl": "https://github.com/dev/w"})
	e.call("POST", fmt.Sprintf("/api/milestones/%d/approve", ms[0]), client, nil)
	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", ms[1]), client, nil)
	e.call("POST", fmt.Sprintf("/api/milestones/%d/submit", ms[1]), dev, map[string]string{"deliverableUrl": "https://github.com/dev/w2"})
	e.call("POST", fmt.Sprintf("/api/milestones/%d/approve", ms[1]), client, nil)

	code, out = e.call("POST", "/api/auth/delete", dev, map[string]string{"password": "wrong", "confirm": "DELETE"})
	e.mustOK(code, out, 403)
	code, out = e.call("POST", "/api/auth/delete", dev, map[string]string{"password": "password123", "confirm": "nope"})
	e.mustOK(code, out, 400)
	code, out = e.call("POST", "/api/auth/delete", dev, map[string]string{"password": "password123", "confirm": "DELETE"})
	e.mustOK(code, out, 200)

	if code, _ = e.call("GET", "/api/auth/me", dev, nil); code != 401 {
		t.Fatalf("deleted account still signed in: %d", code)
	}
	if code, _ = e.call("POST", "/api/auth/login", "", map[string]string{"email": "d@x.io", "password": "password123"}); code != 401 {
		t.Fatalf("deleted account can log in: %d", code)
	}
	var n int
	e.srv.db.QueryRow(`SELECT COUNT(*) FROM developers WHERE user_id = ?`, devID).Scan(&n)
	var name string
	var email *string
	e.srv.db.QueryRow(`SELECT name, email FROM users WHERE id = ?`, devID).Scan(&name, &email)
	if n != 0 || name != "Deleted user" || email != nil {
		t.Fatalf("personal data left behind: profiles=%d name=%q email=%v", n, name, email)
	}
	// The client still sees the finished job, now naming a neutral freelancer.
	code, job := e.call("GET", fmt.Sprintf("/api/jobs/%d", jobID), client, nil)
	if e.mustOK(code, job, 200)["status"] != "completed" {
		t.Fatalf("job history lost: %v", job["status"])
	}
}
