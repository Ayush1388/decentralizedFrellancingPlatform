package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type Notification struct {
	ID        int64  `json:"id"`
	JobID     *int64 `json:"jobId"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
	Read      bool   `json:"read"`
}

func (s *Server) handleListNotifications(w http.ResponseWriter, r *http.Request, uid int64) {
	rows, err := s.db.Query(`SELECT id, job_id, kind, title, body, created_at, read_at IS NOT NULL FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50`, uid)
	if err != nil {
		writeErr(w, 500, "could not load notifications")
		return
	}
	defer rows.Close()
	out := []Notification{}
	for rows.Next() {
		var n Notification
		var job sql.NullInt64
		if rows.Scan(&n.ID, &job, &n.Kind, &n.Title, &n.Body, &n.CreatedAt, &n.Read) == nil {
			if job.Valid {
				n.JobID = &job.Int64
			}
			out = append(out, n)
		}
	}
	writeJSON(w, 200, out)
}

// handleReadNotifications marks some, or all, of the caller's notifications as read.
func (s *Server) handleReadNotifications(w http.ResponseWriter, r *http.Request, uid int64) {
	var b struct {
		IDs []int64 `json:"ids"`
		All bool    `json:"all"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	if b.All {
		s.db.Exec(`UPDATE notifications SET read_at = now() WHERE user_id = ? AND read_at IS NULL`, uid)
	} else if len(b.IDs) > 0 {
		strs := make([]string, len(b.IDs))
		for i, id := range b.IDs {
			strs[i] = fmt.Sprint(id)
		}
		s.db.Exec(`UPDATE notifications SET read_at = now() WHERE user_id = ? AND read_at IS NULL AND id = ANY(?::bigint[])`, uid, "{"+strings.Join(strs, ",")+"}")
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// notifyNewMessage tells the other person about a message: one unread alert per conversation (so a burst of
// messages is one notification, not twenty), and one email when that alert is created.
func (s *Server) notifyNewMessage(to, jobID int64, sender, body string, files int) {
	if to == 0 {
		return
	}
	preview := body
	if len(preview) > 140 {
		preview = preview[:140] + "…"
	}
	if files > 0 {
		if preview != "" {
			preview += " "
		}
		preview += fmt.Sprintf("(%d attachment%s)", files, map[bool]string{true: "", false: "s"}[files == 1])
	}
	res, err := s.db.Exec(`INSERT INTO notifications (user_id, job_id, kind, title, body)
		SELECT ?, ?, 'message', ?, ? WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = ? AND job_id = ? AND kind = 'message' AND read_at IS NULL)`,
		to, jobID, "New message from "+sender, preview, to, jobID)
	if err != nil {
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		s.emailUser(to, jobID, "New message from "+sender, preview)
	}
}

// notifyOnce inserts a notification and emails it, but only the first time (kind, ref) is seen.
func (s *Server) notifyOnce(kind string, ref, uid, jobID int64, subject, line string) {
	res, err := s.db.Exec(`INSERT INTO reminders_sent (kind, ref_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, kind+fmt.Sprintf(":%d", uid), ref)
	if err != nil {
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		s.deliver(uid, jobID, "reminder", subject, line)
	}
}

// handleUnread is the small summary the navigation polls: unread notifications and messages, and per job / application.
func (s *Server) handleUnread(w http.ResponseWriter, r *http.Request, uid int64) {
	out := struct {
		Notifications int           `json:"notifications"`
		Messages      int           `json:"messages"`
		Jobs          map[int64]int `json:"jobs"`
		Apps          map[int64]int `json:"apps"`
	}{Jobs: map[int64]int{}, Apps: map[int64]int{}}

	s.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL`, uid).Scan(&out.Notifications)

	rows, err := s.db.Query(`SELECT m.job_id, COUNT(*) FROM messages m JOIN jobs j ON j.id = m.job_id
		LEFT JOIN chat_reads r ON r.user_id = ? AND r.scope = 'job:' || m.job_id::text
		WHERE m.application_id IS NULL AND (j.client_id = ? OR j.freelancer_id = ?) AND m.sender_id <> ? AND m.id > COALESCE(r.last_id, 0)
		GROUP BY m.job_id`, uid, uid, uid, uid)
	if err == nil {
		for rows.Next() {
			var job int64
			var n int
			rows.Scan(&job, &n)
			out.Jobs[job] += n
			out.Messages += n
		}
		rows.Close()
	}
	rows, err = s.db.Query(`SELECT m.application_id, a.job_id, COUNT(*) FROM messages m JOIN applications a ON a.id = m.application_id JOIN jobs j ON j.id = a.job_id
		LEFT JOIN chat_reads r ON r.user_id = ? AND r.scope = 'app:' || m.application_id::text
		WHERE (a.user_id = ? OR j.client_id = ?) AND m.sender_id <> ? AND m.id > COALESCE(r.last_id, 0)
		GROUP BY m.application_id, a.job_id`, uid, uid, uid, uid)
	if err == nil {
		for rows.Next() {
			var app, job int64
			var n int
			rows.Scan(&app, &job, &n)
			out.Apps[app] += n
			out.Jobs[job] += n
			out.Messages += n
		}
		rows.Close()
	}
	writeJSON(w, 200, out)
}

// ---------- reminders ----------

// sendReminders warns people about deadlines that are about to matter. Each reminder goes out once.
func (s *Server) sendReminders() {
	soon := 48 * time.Hour
	claim, refund := s.cfg.ClaimAfterDays, s.cfg.RefundAfterDays

	// Submitted work: the client's review window is about to end, then the freelancer may claim.
	s.eachReminder(`SELECT m.id, m.title, j.id, j.title, j.client_id, COALESCE(j.freelancer_id, 0), m.submitted_at
		FROM milestones m JOIN jobs j ON j.id = m.job_id WHERE m.status = 'submitted' AND m.submitted_at IS NOT NULL`,
		func(mid int64, mtitle string, jobID int64, jtitle string, client, freelancer int64, at time.Time) {
			end := at.AddDate(0, 0, claim)
			switch {
			case time.Until(end) <= 0:
				s.notifyOnce("claimable", mid, freelancer, jobID, "You can claim your payment: "+mtitle,
					"The client did not respond within "+fmt.Sprint(claim)+" days, so you can now claim \""+mtitle+"\" on \""+jtitle+"\".")
			case time.Until(end) <= soon:
				s.notifyOnce("review-ends", mid, client, jobID, "Review window ends soon: "+mtitle,
					"Your review window for \""+mtitle+"\" on \""+jtitle+"\" ends "+end.Format("2 Jan")+". After that the freelancer can claim the payment. Approve it or ask for changes.")
			}
		})

	// Funded and waiting for work: the freelancer's delivery window is about to end, then the client may reclaim.
	s.eachReminder(`SELECT m.id, m.title, j.id, j.title, j.client_id, COALESCE(j.freelancer_id, 0), m.funded_at
		FROM milestones m JOIN jobs j ON j.id = m.job_id WHERE m.status = 'funded' AND m.funded_at IS NOT NULL`,
		func(mid int64, mtitle string, jobID int64, jtitle string, client, freelancer int64, at time.Time) {
			end := at.AddDate(0, 0, refund)
			switch {
			case time.Until(end) <= 0:
				s.notifyOnce("refundable", mid, client, jobID, "You can reclaim your funds: "+mtitle,
					"Nothing was delivered for \""+mtitle+"\" on \""+jtitle+"\" within "+fmt.Sprint(refund)+" days, so you can reclaim the funds.")
			case time.Until(end) <= soon:
				s.notifyOnce("delivery-ends", mid, freelancer, jobID, "Delivery window ends soon: "+mtitle,
					"The client can reclaim the funds for \""+mtitle+"\" on \""+jtitle+"\" from "+end.Format("2 Jan")+" if nothing is delivered. Submit your work or talk to the client.")
			}
		})

	// A dispute nobody ruled on: either party can now settle it 50/50.
	s.eachReminder(`SELECT m.id, m.title, j.id, j.title, j.client_id, COALESCE(j.freelancer_id, 0), m.disputed_at
		FROM milestones m JOIN jobs j ON j.id = m.job_id WHERE m.status = 'disputed' AND m.disputed_at IS NOT NULL`,
		func(mid int64, mtitle string, jobID int64, jtitle string, client, freelancer int64, at time.Time) {
			if time.Since(at) >= disputeTimeout {
				for _, uid := range []int64{client, freelancer} {
					s.notifyOnce("dispute-stale", mid, uid, jobID, "You can settle the dispute: "+mtitle,
						"The arbiter has not ruled on \""+mtitle+"\" on \""+jtitle+"\" for "+fmt.Sprint(int(disputeTimeout.Hours()/24))+" days. Either of you can now settle it 50/50.")
				}
			}
		})

	// Postings: a deadline coming up with people to review, or one that passed with nobody hired.
	rows, err := s.db.Query(`SELECT j.id, j.title, j.client_id, j.closes_at, (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status IN ('pending','shortlisted'))
		FROM jobs j WHERE j.status = 'open' AND j.closes_at IS NOT NULL AND j.parent_id IS NULL`)
	if err == nil {
		type posting struct {
			id, client int64
			title      string
			closes     time.Time
			waiting    int
		}
		var list []posting
		for rows.Next() {
			var p posting
			if rows.Scan(&p.id, &p.title, &p.client, &p.closes, &p.waiting) == nil {
				list = append(list, p)
			}
		}
		rows.Close()
		for _, p := range list {
			switch {
			case time.Until(p.closes) <= 0:
				s.notifyOnce("expired", p.id, p.client, p.id, "Your posting closed: "+p.title,
					fmt.Sprintf("Applications for \"%s\" closed with %d to review. Extend the deadline from the job page, or hire someone now.", p.title, p.waiting))
			case time.Until(p.closes) <= soon && p.waiting > 0:
				s.notifyOnce("closing", p.id, p.client, p.id, "Closing soon: "+p.title,
					fmt.Sprintf("Applications for \"%s\" close on %s and %d are waiting for your review.", p.title, p.closes.Format("2 Jan"), p.waiting))
			}
		}
	}
}

const disputeTimeout = 30 * 24 * time.Hour // mirrors JobEscrow.DISPUTE_TIMEOUT

func (s *Server) eachReminder(q string, fn func(mid int64, mtitle string, jobID int64, jtitle string, client, freelancer int64, at time.Time)) {
	rows, err := s.db.Query(q)
	if err != nil {
		return
	}
	type item struct {
		mid, jobID, client, freelancer int64
		mtitle, jtitle                 string
		at                             time.Time
	}
	var items []item
	for rows.Next() {
		var it item
		if rows.Scan(&it.mid, &it.mtitle, &it.jobID, &it.jtitle, &it.client, &it.freelancer, &it.at) == nil {
			items = append(items, it)
		}
	}
	rows.Close()
	for _, it := range items {
		fn(it.mid, it.mtitle, it.jobID, it.jtitle, it.client, it.freelancer, it.at)
	}
}
