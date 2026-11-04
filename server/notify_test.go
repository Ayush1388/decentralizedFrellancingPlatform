package main

import (
	"fmt"
	"strings"
	"sync"
	"testing"
)

type sentMail struct{ to, subject, body string }

type fakeMailer struct {
	mu   sync.Mutex
	sent []sentMail
}

func (f *fakeMailer) Send(to, subject, body string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, sentMail{to, subject, body})
	return nil
}

func (f *fakeMailer) take() []sentMail {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := f.sent
	f.sent = nil
	return out
}

func onlyTo(t *testing.T, mails []sentMail, to string) sentMail {
	t.Helper()
	var hit []sentMail
	for _, m := range mails {
		if m.to == to {
			hit = append(hit, m)
		}
	}
	if len(hit) != 1 {
		t.Fatalf("%s got %d emails, want 1 (all: %+v)", to, len(hit), mails)
	}
	return hit[0]
}

func TestEmailsGoToTheRightPeopleOnly(t *testing.T) {
	e := newEnv(t)
	fm := &fakeMailer{}
	e.srv.cfg.AdminEmails = map[string]bool{"arbiter@x.io": true}
	e.srv.cfg.FrontendURL = "https://site.example"

	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")
	jobID, ms := e.postJob(client, nil)
	e.srv.mailer = fm // turned on after setup, like adding SMTP settings to a running site

	// posting a job emails nobody
	e.srv.sendPending()
	if got := fm.take(); len(got) != 0 {
		t.Fatalf("posting sent %+v", got)
	}

	e.apply(jobID, dev)
	e.srv.sendPending()
	m := onlyTo(t, fm.take(), "c@x.io")
	if !strings.Contains(m.subject, "New application") || !strings.Contains(m.body, fmt.Sprintf("https://site.example/jobs/%d", jobID)) {
		t.Fatalf("application email: %+v", m)
	}

	// running the worker again must not resend
	e.srv.sendPending()
	if got := fm.take(); len(got) != 0 {
		t.Fatalf("resent: %+v", got)
	}

	appID := id(e.apps(jobID, client)[0])
	e.call("POST", fmt.Sprintf("/api/applications/%d/status", appID), client, map[string]string{"status": "shortlisted"})
	e.srv.sendPending()
	if m := onlyTo(t, fm.take(), "d@x.io"); !strings.Contains(m.subject, "shortlisted") {
		t.Fatalf("shortlist email: %+v", m)
	}

	e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), client, map[string]int{"applicationId": appID})
	e.srv.sendPending()
	onlyTo(t, fm.take(), "d@x.io") // hired: the applicant, once

	// funding tells the freelancer; delivering tells the client; the actor never emails themselves
	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", ms[0]), client, nil)
	e.call("POST", fmt.Sprintf("/api/milestones/%d/submit", ms[0]), dev, map[string]string{"deliverableUrl": "https://github.com/dev/work"})
	e.srv.sendPending()
	mails := fm.take()
	if len(mails) != 2 {
		t.Fatalf("fund + submit sent %d emails: %+v", len(mails), mails)
	}
	if !strings.Contains(onlyTo(t, mails, "d@x.io").subject, "funded") || !strings.Contains(onlyTo(t, mails, "c@x.io").subject, "delivered") {
		t.Fatalf("unexpected emails: %+v", mails)
	}

	// changes requested carry the note
	e.call("POST", fmt.Sprintf("/api/milestones/%d/revise", ms[0]), client, map[string]string{"feedback": "Please add the mobile layout."})
	e.srv.sendPending()
	if m := onlyTo(t, fm.take(), "d@x.io"); !strings.Contains(m.body, "Please add the mobile layout.") {
		t.Fatalf("change request email lacks the note: %+v", m)
	}

	// a dispute reaches the other party and the arbiter, not the person who opened it
	e.call("POST", fmt.Sprintf("/api/milestones/%d/dispute", ms[0]), dev, map[string]string{"reason": "The client keeps moving the goalposts."})
	e.srv.sendPending()
	mails = fm.take()
	if len(mails) != 2 {
		t.Fatalf("dispute sent %d emails: %+v", len(mails), mails)
	}
	onlyTo(t, mails, "c@x.io")
	onlyTo(t, mails, "arbiter@x.io")

	// opting out stops personal emails
	code, out := e.call("POST", "/api/auth/notifications", client, map[string]bool{"enabled": false})
	e.mustOK(code, out, 200)
	if out["notifyEmail"] != false {
		t.Fatalf("setting not saved: %v", out)
	}
	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", ms[1]), client, nil)
	e.call("POST", fmt.Sprintf("/api/milestones/%d/submit", ms[1]), dev, map[string]string{"deliverableUrl": "https://github.com/dev/work2"})
	e.srv.sendPending()
	for _, m := range fm.take() {
		if m.to == "c@x.io" {
			t.Fatalf("opted-out client still emailed: %+v", m)
		}
	}
}

func TestNoMailerMeansNoWorkAndNoErrors(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	e.postJob(client, nil)
	e.srv.sendPending() // must be a harmless no-op
	if newMailer(Config{}) != nil {
		t.Fatal("a mailer was created without SMTP settings")
	}
	if got := fromAddress("Blockchain Freelance <hello@site.example>"); got != "hello@site.example" {
		t.Fatalf("fromAddress = %q", got)
	}
}
