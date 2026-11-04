package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/smtp"
	"strings"
	"time"
)

// Email notifications, sent from the job activity log.
//
// Every step of a job is already written to job_events inside the same transaction that changed
// the job. A background worker reads events that have not been emailed yet and sends them, so:
//   - nothing is sent for an action that was rolled back,
//   - no handler needs to know about email,
//   - a crash cannot lose an event or send it twice (it is marked before the worker moves on).
// Without SMTP settings the worker does not start and the app behaves exactly as before.

type Mailer interface {
	Send(to, subject, body string) error
}

type smtpMailer struct{ host, port, user, pass, from string }

func (m smtpMailer) Send(to, subject, body string) error {
	clean := func(s string) string { return strings.NewReplacer("\r", " ", "\n", " ").Replace(s) } // no header injection
	msg := "From: " + clean(m.from) + "\r\n" +
		"To: " + clean(to) + "\r\n" +
		"Subject: " + clean(subject) + "\r\n" +
		"Date: " + time.Now().Format(time.RFC1123Z) + "\r\n" +
		"MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" + body + "\r\n"
	var auth smtp.Auth
	if m.user != "" {
		auth = smtp.PlainAuth("", m.user, m.pass, m.host)
	}
	return smtp.SendMail(m.host+":"+m.port, auth, fromAddress(m.from), []string{to}, []byte(msg))
}

// fromAddress turns `Name <a@b.c>` into `a@b.c` for the SMTP envelope.
func fromAddress(from string) string {
	if i := strings.Index(from, "<"); i >= 0 {
		if j := strings.Index(from[i:], ">"); j > 0 {
			return from[i+1 : i+j]
		}
	}
	return from
}

func newMailer(cfg Config) Mailer {
	if cfg.SMTPHost == "" {
		return nil
	}
	return smtpMailer{cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPFrom}
}

// runNotifier sends pending notifications until ctx ends.
func (s *Server) runNotifier(ctx context.Context) {
	t := time.NewTicker(20 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.sendPending()
			s.sendReminders()
		}
	}
}

type pendingEvent struct {
	id, jobID, actor, target, client, freelancer int64
	kind, detail, title                          string
	actorName                                    string
}

// sendPending turns recent job events into notifications (in the app, and by email when SMTP is set).
// Events older than a few hours are skipped so turning email on later does not flood people with history.
func (s *Server) sendPending() {
	rows, err := s.db.Query(`SELECT e.id, e.job_id, COALESCE(e.actor_id, 0), COALESCE(e.target_id, 0), e.kind, e.detail, j.title,
			j.client_id, COALESCE(j.freelancer_id, 0), COALESCE(a.name, '')
		FROM job_events e JOIN jobs j ON j.id = e.job_id LEFT JOIN users a ON a.id = e.actor_id
		WHERE e.notified_at IS NULL AND e.created_at > now() - interval '6 hours'
		ORDER BY e.id LIMIT 50`)
	if err != nil {
		log.Printf("notify: %v", err)
		return
	}
	var evs []pendingEvent
	for rows.Next() {
		var e pendingEvent
		if err := rows.Scan(&e.id, &e.jobID, &e.actor, &e.target, &e.kind, &e.detail, &e.title, &e.client, &e.freelancer, &e.actorName); err == nil {
			evs = append(evs, e)
		}
	}
	rows.Close()

	for _, e := range evs {
		// Mark first: a failed send is logged, never retried in a loop.
		s.db.Exec(`UPDATE job_events SET notified_at = now() WHERE id = ?`, e.id)
		subject, line, ok := composeEmail(e)
		if !ok {
			continue
		}
		for _, uid := range s.recipients(e) {
			s.deliver(uid, e.jobID, e.kind, subject, line)
		}
		if e.kind == "disputed" {
			s.emailAdminsWithoutAccount(e.jobID, subject, line)
		}
	}
}

// emailAdminsWithoutAccount reaches arbiter addresses from ADMIN_EMAILS that have not signed up yet.
func (s *Server) emailAdminsWithoutAccount(jobID int64, subject, line string) {
	if s.mailer == nil {
		return
	}
	for addr := range s.cfg.AdminEmails {
		var n int
		s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = ? AND deleted_at IS NULL`, addr).Scan(&n)
		if n == 0 {
			s.sendMail(addr, subject, line+"\n\n"+s.link(fmt.Sprintf("/jobs/%d", jobID)))
		}
	}
}

// deliver records an in-app notification and emails the person if they have email on.
func (s *Server) deliver(uid, jobID int64, kind, subject, line string) {
	var j any
	if jobID != 0 {
		j = jobID
	}
	s.db.Exec(`INSERT INTO notifications (user_id, job_id, kind, title, body) VALUES (?,?,?,?,?)`, uid, j, kind, subject, line)
	s.emailUser(uid, jobID, subject, line)
}

// emailUser sends a notification email if the server can, and the person has an address and has not opted out.
func (s *Server) emailUser(uid, jobID int64, subject, line string) {
	if s.mailer == nil {
		return
	}
	var email sql.NullString
	var on bool
	if s.db.QueryRow(`SELECT email, notify_email FROM users WHERE id = ? AND deleted_at IS NULL AND banned_at IS NULL`, uid).Scan(&email, &on) != nil || !email.Valid || !on {
		return
	}
	path := "/dashboard"
	if jobID != 0 {
		path = fmt.Sprintf("/jobs/%d", jobID)
	}
	s.sendMail(email.String, subject, line+"\n\n"+s.link(path)+"\n\nYou get these emails because you have an account on Blockchain Freelance. Turn them off from your dashboard.")
}

// recipients lists the people who should hear about an event, never the person who caused it.
func (s *Server) recipients(e pendingEvent) []int64 {
	var ids []int64
	switch e.kind {
	case "applied", "withdrew", "submitted":
		ids = []int64{e.client}
	case "shortlisted", "declined", "hired", "review_reply":
		ids = []int64{e.target}
	case "reviewed":
		if e.target != 0 {
			ids = []int64{e.target}
		} else {
			ids = []int64{e.freelancer}
		}
	case "funded", "changes_requested", "approved", "refunded", "scope_changed", "followup":
		ids = []int64{e.freelancer}
	case "claimed":
		ids = []int64{e.client}
	case "disputed", "resolved":
		ids = []int64{e.client, e.freelancer}
	case "edited":
		rows, err := s.db.Query(`SELECT user_id FROM applications WHERE job_id = ? AND status IN ('pending','shortlisted')`, e.jobID)
		if err == nil {
			for rows.Next() {
				var id int64
				rows.Scan(&id)
				ids = append(ids, id)
			}
			rows.Close()
		}
	}
	if e.kind == "disputed" { // the arbiter always needs to know
		ids = append(ids, s.adminIDs()...)
	}
	var out []int64
	seen := map[int64]bool{}
	for _, id := range ids {
		if id != 0 && id != e.actor && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func (s *Server) adminIDs() []int64 {
	var ids []int64
	for addr := range s.cfg.AdminEmails {
		var id int64
		if s.db.QueryRow(`SELECT id FROM users WHERE email = ? AND deleted_at IS NULL`, addr).Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

// composeEmail writes the subject and the one-line message for an event. ok is false for events nobody needs to hear about.
func composeEmail(e pendingEvent) (subject, line string, ok bool) {
	who := e.actorName
	if who == "" {
		who = "Someone"
	}
	note := ""
	if i := strings.Index(e.detail, ": "); i >= 0 && (e.kind == "changes_requested" || e.kind == "disputed") {
		note = "\n\n\"" + e.detail[i+2:] + "\""
	}
	item := e.detail
	if i := strings.Index(item, ": "); i >= 0 {
		item = item[:i]
	}
	switch e.kind {
	case "applied":
		subject, line = "New application: "+e.title, e.detail+" applied to \""+e.title+"\". Review their quote, resume and links."
	case "withdrew":
		subject, line = "Application withdrawn: "+e.title, who+" withdrew their application."
	case "shortlisted":
		subject, line = "You are shortlisted: "+e.title, "The client shortlisted you for \""+e.title+"\". They may message you with questions."
	case "declined":
		subject, line = "Update on your application: "+e.title, "The client went with someone else for \""+e.title+"\". Thank you for applying."
	case "hired":
		subject, line = "You are hired: "+e.title, "You were hired for \""+e.title+"\". Open the job to see the milestones and start talking to the client."
	case "funded":
		subject, line = "Milestone funded: "+item, who+" funded \""+item+"\" on \""+e.title+"\". The money is in escrow, so you can start."
	case "submitted":
		subject, line = "Work delivered: "+item, who+" delivered \""+item+"\" on \""+e.title+"\". Review it, then approve or ask for changes."
	case "changes_requested":
		subject, line = "Changes requested: "+item, who+" asked for changes on \""+item+"\" on \""+e.title+"\"."+note
	case "approved":
		subject, line = "Payment released: "+item, who+" approved \""+item+"\" on \""+e.title+"\". Your payment is released."
	case "claimed":
		subject, line = "Payment claimed: "+item, who+" claimed \""+item+"\" on \""+e.title+"\" after the review window ended."
	case "refunded":
		subject, line = "Milestone refunded: "+item, who+" reclaimed the funds for \""+item+"\" on \""+e.title+"\"."
	case "disputed":
		subject, line = "Dispute opened: "+item, who+" opened a dispute on \""+item+"\" on \""+e.title+"\". The funds are frozen until the arbiter rules."+note
	case "resolved":
		subject, line = "Dispute resolved: "+item, "The dispute on \""+item+"\" on \""+e.title+"\" is settled. Open the job for the result."
	case "reviewed":
		subject, line = "You received a review: "+e.title, who+" left you a "+e.detail+" review on \""+e.title+"\"."
	case "review_reply":
		subject, line = "Reply to your review: "+e.title, who+" replied to your review on \""+e.title+"\"."
	case "edited":
		subject, line = "Job updated: "+e.title, who+" changed the posting for \""+e.title+"\" you applied to. Take a look before they decide."
	case "scope_changed":
		subject, line = "Milestones changed: "+e.title, who+" changed the milestones and amounts on \""+e.title+"\" before any funding."
	case "followup":
		subject, line = "New work offered: "+e.title, who+" added a follow-up contract with you: \""+e.title+"\"."
	default:
		return "", "", false
	}
	return subject, line, true
}
