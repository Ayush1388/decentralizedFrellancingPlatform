package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
)

// Moderation: reports from users, and the arbiter's tools to hide a posting or suspend an account.
// Admins are the accounts whose email is listed in ADMIN_EMAILS.

func (s *Server) requireAdmin(w http.ResponseWriter, uid int64) bool {
	if !s.isAdminUser(uid) {
		writeErr(w, 403, "Only the platform team can do this")
		return false
	}
	return true
}

// handleReport lets anyone signed in flag a job or a person.
func (s *Server) handleReport(w http.ResponseWriter, r *http.Request, uid int64) {
	var b struct {
		Kind     string `json:"kind"`
		TargetID int64  `json:"targetId"`
		Reason   string `json:"reason"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	b.Reason = strings.TrimSpace(b.Reason)
	if (b.Kind != "job" && b.Kind != "user") || b.TargetID <= 0 || len(b.Reason) < 10 || len(b.Reason) > 1000 {
		writeErr(w, 400, "Say what is wrong in 10 to 1000 characters")
		return
	}
	table := map[string]string{"job": "jobs", "user": "users"}[b.Kind]
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM `+table+` WHERE id = ?`, b.TargetID).Scan(&n)
	if n == 0 {
		writeErr(w, 404, "That "+b.Kind+" does not exist")
		return
	}
	if b.Kind == "user" && b.TargetID == uid {
		writeErr(w, 400, "You cannot report yourself")
		return
	}
	if _, err := s.db.Exec(`INSERT INTO reports (reporter_id, kind, target_id, reason) VALUES (?,?,?,?)`, uid, b.Kind, b.TargetID, b.Reason); err != nil {
		writeErr(w, 500, "could not send the report")
		return
	}
	for _, admin := range s.adminIDs() {
		s.deliver(admin, 0, "report", "New report: "+b.Kind+" #"+fmt.Sprint(b.TargetID), b.Reason)
	}
	writeJSON(w, 201, map[string]bool{"ok": true})
}

type ReportOut struct {
	ID         int64  `json:"id"`
	Kind       string `json:"kind"`
	TargetID   int64  `json:"targetId"`
	TargetName string `json:"targetName"`
	Reason     string `json:"reason"`
	Reporter   string `json:"reporter"`
	CreatedAt  string `json:"createdAt"`
	Resolved   bool   `json:"resolved"`
	Note       string `json:"note"`
}

func (s *Server) handleAdminReports(w http.ResponseWriter, r *http.Request, uid int64) {
	if !s.requireAdmin(w, uid) {
		return
	}
	where := "WHERE r.resolved_at IS NULL"
	if r.URL.Query().Get("status") == "all" {
		where = ""
	}
	rows, err := s.db.Query(`SELECT r.id, r.kind, r.target_id, r.reason, u.name, r.created_at, r.resolved_at IS NOT NULL, r.note,
			CASE r.kind WHEN 'job' THEN COALESCE((SELECT title FROM jobs WHERE id = r.target_id), '') ELSE COALESCE((SELECT name FROM users WHERE id = r.target_id), '') END
		FROM reports r JOIN users u ON u.id = r.reporter_id ` + where + ` ORDER BY r.id DESC LIMIT 100`)
	if err != nil {
		writeErr(w, 500, "could not load reports")
		return
	}
	defer rows.Close()
	out := []ReportOut{}
	for rows.Next() {
		var o ReportOut
		if rows.Scan(&o.ID, &o.Kind, &o.TargetID, &o.Reason, &o.Reporter, &o.CreatedAt, &o.Resolved, &o.Note, &o.TargetName) == nil {
			out = append(out, o)
		}
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleResolveReport(w http.ResponseWriter, r *http.Request, uid int64) {
	if !s.requireAdmin(w, uid) {
		return
	}
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var b struct {
		Note string `json:"note"`
	}
	decodeJSON(r, &b)
	res, err := s.db.Exec(`UPDATE reports SET resolved_at = now(), resolved_by = ?, note = ? WHERE id = ? AND resolved_at IS NULL`, uid, strings.TrimSpace(b.Note), id)
	if err != nil {
		writeErr(w, 500, "could not resolve the report")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, 404, "report not found or already resolved")
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

type AdminUser struct {
	ID        int64   `json:"id"`
	Name      string  `json:"name"`
	Email     *string `json:"email"`
	Wallet    *string `json:"wallet"`
	CreatedAt string  `json:"createdAt"`
	Banned    bool    `json:"banned"`
	Reason    string  `json:"banReason"`
	Demo      bool    `json:"demo"`
	Jobs      int     `json:"jobs"`
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request, uid int64) {
	if !s.requireAdmin(w, uid) {
		return
	}
	q := "%" + strings.TrimSpace(r.URL.Query().Get("q")) + "%"
	rows, err := s.db.Query(`SELECT u.id, u.name, u.email, u.wallet_address, u.created_at, u.banned_at IS NOT NULL, u.ban_reason, u.is_demo,
			(SELECT COUNT(*) FROM jobs WHERE client_id = u.id OR freelancer_id = u.id)
		FROM users u WHERE u.deleted_at IS NULL AND (u.name ILIKE ? OR u.email ILIKE ? OR u.wallet_address ILIKE ?) ORDER BY u.id DESC LIMIT 50`, q, q, q)
	if err != nil {
		writeErr(w, 500, "could not load users")
		return
	}
	defer rows.Close()
	out := []AdminUser{}
	for rows.Next() {
		var u AdminUser
		if rows.Scan(&u.ID, &u.Name, &u.Email, &u.Wallet, &u.CreatedAt, &u.Banned, &u.Reason, &u.Demo, &u.Jobs) == nil {
			out = append(out, u)
		}
	}
	writeJSON(w, 200, out)
}

// handleBanUser suspends or restores an account. A suspended account is signed out everywhere, its open
// postings are closed, and it cannot log in. Contracts already running are left alone, so nobody's money is trapped.
func (s *Server) handleBanUser(w http.ResponseWriter, r *http.Request, uid int64) {
	if !s.requireAdmin(w, uid) {
		return
	}
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var b struct {
		Banned bool   `json:"banned"`
		Reason string `json:"reason"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	if id == uid || s.isAdminUser(id) {
		writeErr(w, 403, "Platform team accounts cannot be suspended")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not update the account")
		return
	}
	defer tx.Rollback()
	var res sql.Result
	if b.Banned {
		res, err = tx.Exec(`UPDATE users SET banned_at = now(), ban_reason = ?, token_version = token_version + 1 WHERE id = ? AND deleted_at IS NULL`, strings.TrimSpace(b.Reason), id)
		tx.Exec(`UPDATE jobs SET status = 'cancelled' WHERE client_id = ? AND status IN ('draft','open','filled')`, id)
		tx.Exec(`DELETE FROM applications WHERE user_id = ? AND status IN ('pending','shortlisted')`, id)
	} else {
		res, err = tx.Exec(`UPDATE users SET banned_at = NULL, ban_reason = '' WHERE id = ? AND deleted_at IS NULL`, id)
	}
	if err != nil {
		writeErr(w, 500, "could not update the account")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, 404, "user not found")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not update the account")
		return
	}
	writeJSON(w, 200, map[string]bool{"banned": b.Banned})
}

// handleAdminRemoveJob closes a posting that broke the rules.
func (s *Server) handleAdminRemoveJob(w http.ResponseWriter, r *http.Request, uid int64) {
	if !s.requireAdmin(w, uid) {
		return
	}
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	res, err := s.db.Exec(`UPDATE jobs SET status = 'cancelled' WHERE id = ? AND status IN ('draft','open','filled')`, id)
	if err != nil {
		writeErr(w, 500, "could not remove the job")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, 409, "Only postings that are not under contract can be removed")
		return
	}
	s.db.Exec(`UPDATE applications SET status = 'declined' WHERE job_id = ? AND status IN ('pending','shortlisted')`, id)
	writeJSON(w, 200, map[string]bool{"ok": true})
}
