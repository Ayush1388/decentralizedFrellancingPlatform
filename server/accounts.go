package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ---------- rate limiting ----------

// limiter is a small in-memory sliding-window counter. It is per process, which is fine for one API
// instance; behind several instances it would need a shared store.
type limiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

func newLimiter() *limiter { return &limiter{hits: map[string][]time.Time{}} }

// allow records a hit and reports whether the key is still under max hits per window.
func (l *limiter) allow(key string, max int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cut := now.Add(-window)
	kept := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= max {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	if len(l.hits) > 20000 { // keep memory bounded under a flood of distinct keys
		for k, v := range l.hits {
			if len(v) == 0 || v[len(v)-1].Before(cut) {
				delete(l.hits, k)
			}
		}
	}
	return true
}

// clientIP is the caller's address. Behind Render's proxy the first X-Forwarded-For entry is the client.
func clientIP(r *http.Request) string {
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		return strings.TrimSpace(strings.Split(xf, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// rateOK checks a named bucket. Each bucket also has a global cap so a flood of spoofed addresses cannot
// bypass the per-address limit.
func (s *Server) rateOK(w http.ResponseWriter, name, who string, max int, window time.Duration) bool {
	if s.cfg.NoRateLimit {
		return true
	}
	if !s.limiter.allow(name+"|*", max*40, window) || !s.limiter.allow(name+"|"+who, max, window) {
		w.Header().Set("Retry-After", fmt.Sprint(int(window.Seconds())))
		writeErr(w, 429, "Too many attempts. Please wait a while and try again.")
		return false
	}
	return true
}

// limited wraps a handler with a per-address rate limit.
func (s *Server) limited(name string, max int, window time.Duration, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.rateOK(w, name, clientIP(r), max, window) {
			return
		}
		next(w, r)
	}
}

// limitedAuth wraps an authenticated handler with a per-user rate limit.
func (s *Server) limitedAuth(name string, max int, window time.Duration, next func(http.ResponseWriter, *http.Request, int64)) func(http.ResponseWriter, *http.Request, int64) {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		if !s.rateOK(w, name, fmt.Sprint(uid), max, window) {
			return
		}
		next(w, r, uid)
	}
}

// ---------- CAPTCHA (Cloudflare Turnstile, optional) ----------

func (s *Server) captchaOK(token, ip string) bool {
	if s.cfg.TurnstileSecret == "" {
		return true
	}
	if token == "" {
		return false
	}
	form := url.Values{"secret": {s.cfg.TurnstileSecret}, "response": {token}, "remoteip": {ip}}
	c := http.Client{Timeout: 8 * time.Second}
	resp, err := c.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", form)
	if err != nil {
		log.Printf("captcha: %v", err)
		return false
	}
	defer resp.Body.Close()
	var out struct {
		Success bool `json:"success"`
	}
	json.NewDecoder(resp.Body).Decode(&out)
	return out.Success
}

// ---------- email tokens ----------

func hashToken(t string) string {
	h := sha256.Sum256([]byte(t))
	return hex.EncodeToString(h[:])
}

// newEmailToken stores a single-use token and returns the raw value to put in a link.
func (s *Server) newEmailToken(uid int64, kind string, ttl time.Duration) (string, error) {
	raw := randomHex(24)
	_, err := s.db.Exec(`INSERT INTO email_tokens (token_hash, user_id, kind, expires_at) VALUES (?,?,?,?)`, hashToken(raw), uid, kind, now().Add(ttl))
	return raw, err
}

// useEmailToken burns a token and returns the user it belongs to.
func (s *Server) useEmailToken(raw, kind string) (int64, bool) {
	var uid int64
	err := s.db.QueryRow(`UPDATE email_tokens SET used_at = now() WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
		hashToken(raw), kind).Scan(&uid)
	return uid, err == nil
}

// sendMail sends in the background so a slow mail server never slows a request down.
func (s *Server) sendMail(to, subject, body string) {
	if s.mailer == nil || to == "" {
		return
	}
	send := func() {
		if err := s.mailer.Send(to, subject, body); err != nil {
			log.Printf("mail: could not send %q to %s: %v", subject, to, err)
		}
	}
	if s.syncMail {
		send()
		return
	}
	go send()
}

func (s *Server) link(path string) string { return strings.TrimRight(s.cfg.FrontendURL, "/") + path }

func (s *Server) sendVerification(uid int64, email string) {
	tok, err := s.newEmailToken(uid, "verify", 48*time.Hour)
	if err != nil {
		return
	}
	s.sendMail(email, "Confirm your email", "Welcome to Blockchain Freelance.\n\nConfirm your email address to post jobs and apply:\n\n"+
		s.link("/verify?token="+tok)+"\n\nThe link works for 48 hours. If you did not create an account, ignore this email.")
}

// mustBeVerified stops unverified accounts from creating things when the server can send email.
// Accounts without an email (wallet sign-in) are exempt: the wallet is their identity.
func (s *Server) mustBeVerified(w http.ResponseWriter, uid int64) bool {
	if s.mailer == nil {
		return true
	}
	var email sql.NullString
	var verified bool
	s.db.QueryRow(`SELECT email, email_verified FROM users WHERE id = ?`, uid).Scan(&email, &verified)
	if email.Valid && !verified {
		writeErr(w, 403, "Confirm your email address first. We sent you a link when you signed up.")
		return false
	}
	return true
}

// ---------- handlers ----------

func (s *Server) handleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Token string `json:"token"`
	}
	if decodeJSON(r, &b) != nil || b.Token == "" {
		writeErr(w, 400, "invalid request body")
		return
	}
	uid, ok := s.useEmailToken(b.Token, "verify")
	if !ok {
		writeErr(w, 400, "This confirmation link is invalid or has expired. Request a new one from your dashboard.")
		return
	}
	s.db.Exec(`UPDATE users SET email_verified = true WHERE id = ?`, uid)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) handleResendVerification(w http.ResponseWriter, r *http.Request, uid int64) {
	var email sql.NullString
	var verified bool
	s.db.QueryRow(`SELECT email, email_verified FROM users WHERE id = ?`, uid).Scan(&email, &verified)
	switch {
	case !email.Valid:
		writeErr(w, 400, "Add an email address first")
		return
	case verified:
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	case s.mailer == nil:
		writeErr(w, 503, "This server cannot send email right now")
		return
	}
	s.sendVerification(uid, email.String)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Email   string `json:"email"`
		Captcha string `json:"captcha"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(b.Email))
	if !s.captchaOK(b.Captcha, clientIP(r)) {
		writeErr(w, 400, "Please complete the human check")
		return
	}
	if email != "" && s.rateOK(w, "forgot-email", email, 3, time.Hour) {
		var uid int64
		if s.db.QueryRow(`SELECT id FROM users WHERE email = ? AND password_hash IS NOT NULL AND deleted_at IS NULL AND banned_at IS NULL`, email).Scan(&uid) == nil && s.mailer != nil {
			if tok, err := s.newEmailToken(uid, "reset", time.Hour); err == nil {
				s.sendMail(email, "Reset your password", "Someone asked to reset the password for this account.\n\nChoose a new password here (the link works for one hour):\n\n"+
					s.link("/reset?token="+tok)+"\n\nIf that was not you, ignore this email. Your password stays the same.")
			}
		}
	} else if email != "" {
		return // rateOK already wrote the 429
	}
	// Same answer whether or not the account exists, so addresses cannot be probed.
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if decodeJSON(r, &b) != nil || b.Token == "" {
		writeErr(w, 400, "invalid request body")
		return
	}
	if len(b.Password) < 8 || len(b.Password) > 72 {
		writeErr(w, 400, "Password must be 8 to 72 characters")
		return
	}
	uid, ok := s.useEmailToken(b.Token, "reset")
	if !ok {
		writeErr(w, 400, "This reset link is invalid or has expired. Ask for a new one.")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(b.Password), bcrypt.DefaultCost)
	if err != nil {
		writeErr(w, 500, "could not hash password")
		return
	}
	// A reset proves control of the inbox, and signs every old session out.
	s.db.Exec(`UPDATE users SET password_hash = ?, email_verified = true, token_version = token_version + 1 WHERE id = ?`, string(hash), uid)
	s.respondWithSession(w, 200, uid)
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request, uid int64) {
	var b struct {
		Current string `json:"current"`
		Next    string `json:"next"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	if len(b.Next) < 8 || len(b.Next) > 72 {
		writeErr(w, 400, "New password must be 8 to 72 characters")
		return
	}
	var hash sql.NullString
	s.db.QueryRow(`SELECT password_hash FROM users WHERE id = ?`, uid).Scan(&hash)
	if hash.Valid && bcrypt.CompareHashAndPassword([]byte(hash.String), []byte(b.Current)) != nil {
		writeErr(w, 403, "Your current password is not right")
		return
	}
	nh, err := bcrypt.GenerateFromPassword([]byte(b.Next), bcrypt.DefaultCost)
	if err != nil {
		writeErr(w, 500, "could not hash password")
		return
	}
	s.db.Exec(`UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?`, string(nh), uid)
	s.respondWithSession(w, 200, uid) // a fresh token: every other session is now signed out
}

func (s *Server) handleLogoutAll(w http.ResponseWriter, r *http.Request, uid int64) {
	s.db.Exec(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`, uid)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// handleSetEmail adds or changes the account's email (a wallet-only account has none).
func (s *Server) handleSetEmail(w http.ResponseWriter, r *http.Request, uid int64) {
	var b struct {
		Email string `json:"email"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(b.Email))
	if !validEmail(email) {
		writeErr(w, 400, "Enter a valid email address")
		return
	}
	verified := s.mailer == nil // without email delivery there is nothing to confirm against
	if _, err := s.db.Exec(`UPDATE users SET email = ?, email_verified = ? WHERE id = ?`, email, verified, uid); err != nil {
		if isUnique(err) {
			writeErr(w, 409, "Another account already uses this email")
			return
		}
		writeErr(w, 500, "could not save the email")
		return
	}
	if !verified {
		s.sendVerification(uid, email)
	}
	u, _ := s.userByID(uid)
	writeJSON(w, 200, u)
}

// handleExport returns everything the platform holds about the caller, as JSON.
func (s *Server) handleExport(w http.ResponseWriter, r *http.Request, uid int64) {
	u, err := s.userByID(uid)
	if err != nil {
		writeErr(w, 401, "account no longer exists")
		return
	}
	rowsOf := func(q string, args ...any) []map[string]any {
		rows, err := s.db.Query(q, args...)
		if err != nil {
			return nil
		}
		defer rows.Close()
		cols, _ := rows.Columns()
		var out []map[string]any
		for rows.Next() {
			vals := make([]any, len(cols))
			ptrs := make([]any, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			rows.Scan(ptrs...)
			m := map[string]any{}
			for i, c := range cols {
				if b, ok := vals[i].([]byte); ok {
					vals[i] = string(b)
				}
				m[c] = vals[i]
			}
			out = append(out, m)
		}
		return out
	}
	out := map[string]any{
		"exportedAt":       now(),
		"account":          u,
		"developer":        rowsOf(`SELECT name, title, bio, hourly_rate, jobs_done, rating, skills::text AS skills, created_at FROM developers WHERE user_id = ?`, uid),
		"jobsAsClient":     rowsOf(`SELECT id, title, description, status, created_at FROM jobs WHERE client_id = ?`, uid),
		"jobsAsFreelancer": rowsOf(`SELECT id, title, status, created_at FROM jobs WHERE freelancer_id = ?`, uid),
		"applications":     rowsOf(`SELECT job_id, cover, status, github_url, portfolio_url, bid, eta_days, created_at FROM applications WHERE user_id = ?`, uid),
		"messages":         rowsOf(`SELECT job_id, body, created_at FROM messages WHERE sender_id = ? ORDER BY id`, uid),
		"reviewsGiven":     rowsOf(`SELECT job_id, kind, rating, comment, created_at FROM reviews WHERE reviewer_id = ?`, uid),
		"reviewsAbout":     rowsOf(`SELECT job_id, kind, rating, comment, reply, created_at FROM reviews WHERE subject_id = ?`, uid),
		"savedJobs":        rowsOf(`SELECT job_id, created_at FROM saved_jobs WHERE user_id = ?`, uid),
	}
	w.Header().Set("Content-Disposition", `attachment; filename="my-data.json"`)
	writeJSON(w, 200, out)
}

// handleDeleteAccount removes the caller's personal data. It refuses while money is still in play, and keeps
// what other people's records depend on (job history, messages) under a neutral name.
func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request, uid int64) {
	var b struct {
		Password string `json:"password"`
		Confirm  string `json:"confirm"`
	}
	if decodeJSON(r, &b) != nil || b.Confirm != "DELETE" {
		writeErr(w, 400, `Type DELETE to confirm`)
		return
	}
	var hash sql.NullString
	s.db.QueryRow(`SELECT password_hash FROM users WHERE id = ?`, uid).Scan(&hash)
	if hash.Valid && bcrypt.CompareHashAndPassword([]byte(hash.String), []byte(b.Password)) != nil {
		writeErr(w, 403, "Your password is not right")
		return
	}
	if s.isAdminUser(uid) {
		writeErr(w, 403, "The platform arbiter account cannot be deleted")
		return
	}
	var live int
	s.db.QueryRow(`SELECT COUNT(*) FROM jobs j WHERE (j.client_id = ? OR j.freelancer_id = ?) AND j.status = 'in_progress'
		AND EXISTS (SELECT 1 FROM milestones m WHERE m.job_id = j.id AND m.status NOT IN ('released','resolved','refunded'))`, uid, uid).Scan(&live)
	if live > 0 {
		writeErr(w, 409, "You still have unfinished contracts. Finish, refund or settle them first, so nobody loses money.")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not delete the account")
		return
	}
	defer tx.Rollback()
	tx.Exec(`UPDATE jobs SET status = 'cancelled' WHERE client_id = ? AND status IN ('draft','open','filled')`, uid)
	tx.Exec(`DELETE FROM applications WHERE user_id = ? AND status IN ('pending','shortlisted')`, uid)
	tx.Exec(`DELETE FROM developers WHERE user_id = ?`, uid)
	tx.Exec(`DELETE FROM files WHERE owner_id = ?`, uid)
	tx.Exec(`DELETE FROM saved_jobs WHERE user_id = ?`, uid)
	tx.Exec(`DELETE FROM notifications WHERE user_id = ?`, uid)
	tx.Exec(`DELETE FROM email_tokens WHERE user_id = ?`, uid)
	tx.Exec(`DELETE FROM wallet_nonces WHERE address IN (SELECT wallet_address FROM users WHERE id = ?)`, uid)
	if _, err := tx.Exec(`UPDATE users SET name = 'Deleted user', email = NULL, password_hash = NULL, google_id = NULL, wallet_address = NULL,
		notify_email = false, deleted_at = now(), token_version = token_version + 1 WHERE id = ?`, uid); err != nil {
		writeErr(w, 500, "could not delete the account")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not delete the account")
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
