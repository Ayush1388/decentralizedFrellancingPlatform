package main

import (
	"database/sql"
	"errors"
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const usdcUnit = 1_000_000 // USDC has 6 decimals

type Party struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type Milestone struct {
	ID             int64   `json:"id"`
	Position       int     `json:"position"`
	Title          string  `json:"title"`
	Amount         int64   `json:"amount"`
	Status         string  `json:"status"`
	DeliverableURL *string `json:"deliverableUrl"`
	FundTx         *string `json:"fundTx"`
	ReleaseTx      *string `json:"releaseTx"`
	FundedAt       *string `json:"fundedAt"`
	SubmittedAt    *string `json:"submittedAt"`
	FreelancerBps  *int    `json:"freelancerBps"`
	ClaimableAt    *string `json:"claimableAt"`  // freelancer may claim after this if the client stays silent
	RefundableAt   *string `json:"refundableAt"` // client may reclaim after this if nothing was submitted
}

type Application struct {
	ID        int64  `json:"id"`
	JobID     int64  `json:"jobId,omitempty"`
	User      Party  `json:"user"`
	Cover     string `json:"cover"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
	DevID     *int64 `json:"developerId"`
	HasWallet bool   `json:"hasWallet"`
}

type JobSummary struct {
	ID          int64    `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Skills      []string `json:"skills"`
	Status      string   `json:"status"`
	CreatedAt   string   `json:"createdAt"`
	Client      Party    `json:"client"`
	Freelancer  *Party   `json:"freelancer"`
	Total       int64    `json:"total"`
	Applicants  int      `json:"applicants"`
}

type JobDetail struct {
	JobSummary
	Milestones       []Milestone   `json:"milestones"`
	ViewerRole       string        `json:"viewerRole"`
	Applications     []Application `json:"applications,omitempty"`
	MyApplication    *Application  `json:"myApplication,omitempty"`
	EscrowID         *int64        `json:"escrowId"`
	ClientWallet     *string       `json:"clientWallet,omitempty"`
	FreelancerWallet *string       `json:"freelancerWallet,omitempty"`
	FeeBps           int           `json:"feeBps"`
	ClaimDays        int           `json:"claimAfterDays"`
	RefundDays       int           `json:"refundAfterDays"`
}

const jobSelect = `
SELECT j.id, j.title, j.description, j.skills, j.status, j.created_at,
       c.id, c.name, f.id, f.name,
       COALESCE((SELECT SUM(amount)::bigint FROM milestones WHERE job_id = j.id), 0),
       (SELECT COUNT(*) FROM applications WHERE job_id = j.id)
FROM jobs j
JOIN users c ON c.id = j.client_id
LEFT JOIN users f ON f.id = j.freelancer_id`

func scanJob(r rowScanner) (JobSummary, error) {
	var j JobSummary
	var skills string
	var fid sql.NullInt64
	var fname sql.NullString
	err := r.Scan(&j.ID, &j.Title, &j.Description, &skills, &j.Status, &j.CreatedAt,
		&j.Client.ID, &j.Client.Name, &fid, &fname, &j.Total, &j.Applicants)
	j.Skills = parseSkills(skills)
	if fid.Valid {
		j.Freelancer = &Party{ID: fid.Int64, Name: fname.String}
	}
	return j, err
}

func (s *Server) handleListJobs(w http.ResponseWriter, r *http.Request) {
	q := jobSelect
	var where []string
	var args []any
	if st := r.URL.Query().Get("status"); st != "" {
		where = append(where, "j.status = ?")
		args = append(args, st)
	}
	if term := strings.TrimSpace(r.URL.Query().Get("q")); term != "" {
		like := "%" + term + "%"
		where = append(where, "(j.title ILIKE ? OR j.description ILIKE ? OR j.skills::text ILIKE ?)")
		args = append(args, like, like, like)
	}
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY j.id DESC LIMIT 100"
	s.writeJobList(w, q, args...)
}

func (s *Server) handleMyJobs(w http.ResponseWriter, r *http.Request, uid int64) {
	s.writeJobList(w, jobSelect+` WHERE j.client_id = ? OR j.freelancer_id = ?
		OR j.id IN (SELECT job_id FROM applications WHERE user_id = ?) ORDER BY j.id DESC`, uid, uid, uid)
}

func (s *Server) writeJobList(w http.ResponseWriter, q string, args ...any) {
	rows, err := s.db.Query(q, args...)
	if err != nil {
		writeErr(w, 500, "could not load jobs")
		return
	}
	defer rows.Close()
	out := []JobSummary{}
	for rows.Next() {
		j, err := scanJob(rows)
		if err != nil {
			writeErr(w, 500, "could not load jobs")
			return
		}
		out = append(out, j)
	}
	writeJSON(w, 200, out)
}

type milestoneInput struct {
	Title  string  `json:"title"`
	Amount float64 `json:"amount"` // USDC
}

func (s *Server) handleCreateJob(w http.ResponseWriter, r *http.Request, uid int64) {
	var b struct {
		Title       string           `json:"title"`
		Description string           `json:"description"`
		Skills      []string         `json:"skills"`
		Milestones  []milestoneInput `json:"milestones"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	b.Title, b.Description = strings.TrimSpace(b.Title), strings.TrimSpace(b.Description)
	switch {
	case len(b.Title) < 5 || len(b.Title) > 120:
		writeErr(w, 400, "Title must be 5 to 120 characters")
		return
	case len(b.Description) < 20 || len(b.Description) > 5000:
		writeErr(w, 400, "Description must be 20 to 5000 characters")
		return
	case len(b.Milestones) < 1 || len(b.Milestones) > 10:
		writeErr(w, 400, "Add between 1 and 10 milestones")
		return
	}
	amounts := make([]int64, len(b.Milestones))
	for i, m := range b.Milestones {
		m.Title = strings.TrimSpace(m.Title)
		b.Milestones[i].Title = m.Title
		if m.Title == "" || len(m.Title) > 100 {
			writeErr(w, 400, "Every milestone needs a title under 100 characters")
			return
		}
		if math.IsNaN(m.Amount) || m.Amount < 1 || m.Amount > 1_000_000 {
			writeErr(w, 400, "Milestone amounts must be between 1 and 1,000,000 USDC")
			return
		}
		amounts[i] = int64(math.Round(m.Amount * usdcUnit))
	}

	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not create job")
		return
	}
	defer tx.Rollback()
	jobID, err := insertID(tx, `INSERT INTO jobs (client_id, title, description, skills) VALUES (?,?,?,?::jsonb)`,
		uid, b.Title, b.Description, skillsJSON(b.Skills))
	if err != nil {
		writeErr(w, 500, "could not create job")
		return
	}
	for i, m := range b.Milestones {
		if _, err := tx.Exec(`INSERT INTO milestones (job_id, position, title, amount) VALUES (?,?,?,?)`, jobID, i+1, m.Title, amounts[i]); err != nil {
			writeErr(w, 500, "could not create milestones")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not create job")
		return
	}
	s.writeJobDetail(w, 201, jobID, uid)
}

func (s *Server) handleGetJob(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	s.writeJobDetail(w, 200, id, s.uidFromRequest(r))
}

func (s *Server) loadJobDetail(id, viewer int64) (JobDetail, error) {
	var d JobDetail
	js, err := scanJob(s.db.QueryRow(jobSelect+" WHERE j.id = ?", id))
	if err != nil {
		return d, err
	}
	d.JobSummary = js
	d.FeeBps, d.ClaimDays, d.RefundDays = s.cfg.FeeBps, s.cfg.ClaimAfterDays, s.cfg.RefundAfterDays
	d.Milestones = []Milestone{}

	rows, err := s.db.Query(`SELECT id, position, title, amount, status, deliverable_url, fund_tx, release_tx, funded_at, submitted_at, freelancer_bps
		FROM milestones WHERE job_id = ? ORDER BY position`, id)
	if err != nil {
		return d, err
	}
	for rows.Next() {
		var m Milestone
		if err := rows.Scan(&m.ID, &m.Position, &m.Title, &m.Amount, &m.Status, &m.DeliverableURL, &m.FundTx, &m.ReleaseTx, &m.FundedAt, &m.SubmittedAt, &m.FreelancerBps); err != nil {
			rows.Close()
			return d, err
		}
		if m.Status == "submitted" && m.SubmittedAt != nil {
			m.ClaimableAt = addDays(*m.SubmittedAt, s.cfg.ClaimAfterDays)
		}
		if m.Status == "funded" && m.FundedAt != nil {
			m.RefundableAt = addDays(*m.FundedAt, s.cfg.RefundAfterDays)
		}
		d.Milestones = append(d.Milestones, m)
	}
	rows.Close()

	d.ViewerRole = "visitor"
	switch {
	case viewer == 0:
	case viewer == d.Client.ID:
		d.ViewerRole = "client"
	case d.Freelancer != nil && viewer == d.Freelancer.ID:
		d.ViewerRole = "freelancer"
	}

	s.db.QueryRow(`SELECT escrow_id FROM jobs WHERE id = ?`, id).Scan(&d.EscrowID)
	if d.ViewerRole == "client" || d.ViewerRole == "freelancer" {
		s.db.QueryRow(`SELECT wallet_address FROM users WHERE id = ?`, d.Client.ID).Scan(&d.ClientWallet)
		if d.Freelancer != nil {
			s.db.QueryRow(`SELECT wallet_address FROM users WHERE id = ?`, d.Freelancer.ID).Scan(&d.FreelancerWallet)
		}
	}

	appQ := `SELECT a.id, a.user_id, u.name, a.cover, a.status, a.created_at, (SELECT id FROM developers WHERE user_id = a.user_id), u.wallet_address IS NOT NULL
		FROM applications a JOIN users u ON u.id = a.user_id WHERE a.job_id = ?`
	if d.ViewerRole == "client" {
		rows, err := s.db.Query(appQ+" ORDER BY a.id", id)
		if err != nil {
			return d, err
		}
		for rows.Next() {
			var a Application
			if err := rows.Scan(&a.ID, &a.User.ID, &a.User.Name, &a.Cover, &a.Status, &a.CreatedAt, &a.DevID, &a.HasWallet); err != nil {
				rows.Close()
				return d, err
			}
			d.Applications = append(d.Applications, a)
		}
		rows.Close()
	} else if viewer != 0 {
		var a Application
		err := s.db.QueryRow(appQ+" AND a.user_id = ?", id, viewer).Scan(&a.ID, &a.User.ID, &a.User.Name, &a.Cover, &a.Status, &a.CreatedAt, &a.DevID, &a.HasWallet)
		if err == nil {
			d.MyApplication = &a
			if d.ViewerRole == "visitor" {
				d.ViewerRole = "applicant"
			}
		}
	}
	return d, nil
}

func addDays(ts string, days int) *string {
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return nil
	}
	s := t.AddDate(0, 0, days).UTC().Format(time.RFC3339)
	return &s
}

func (s *Server) writeJobDetail(w http.ResponseWriter, status int, id, viewer int64) {
	d, err := s.loadJobDetail(id, viewer)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, 404, "job not found")
		return
	}
	if err != nil {
		writeErr(w, 500, "could not load job")
		return
	}
	writeJSON(w, status, d)
}

func (s *Server) handleApply(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var b struct {
		Cover string `json:"cover"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	b.Cover = strings.TrimSpace(b.Cover)
	if len(b.Cover) < 20 || len(b.Cover) > 2000 {
		writeErr(w, 400, "Write a cover note of 20 to 2000 characters")
		return
	}
	var client int64
	var status string
	if err := s.db.QueryRow(`SELECT client_id, status FROM jobs WHERE id = ?`, id).Scan(&client, &status); err != nil {
		writeErr(w, 404, "job not found")
		return
	}
	switch {
	case client == uid:
		writeErr(w, 403, "You cannot apply to your own job")
		return
	case status != "open":
		writeErr(w, 409, "This job is no longer open")
		return
	}
	if _, err := s.db.Exec(`INSERT INTO applications (job_id, user_id, cover) VALUES (?,?,?)`, id, uid, b.Cover); err != nil {
		if isUnique(err) {
			writeErr(w, 409, "You already applied to this job")
			return
		}
		writeErr(w, 500, "could not submit application")
		return
	}
	s.writeJobDetail(w, 201, id, uid)
}

func (s *Server) handleHire(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var b struct {
		ApplicationID int64 `json:"applicationId"`
	}
	if decodeJSON(r, &b) != nil || b.ApplicationID == 0 {
		writeErr(w, 400, "applicationId is required")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not hire")
		return
	}
	defer tx.Rollback()
	var client int64
	var status string
	if err := tx.QueryRow(`SELECT client_id, status FROM jobs WHERE id = ?`, id).Scan(&client, &status); err != nil {
		writeErr(w, 404, "job not found")
		return
	}
	if client != uid {
		writeErr(w, 403, "Only the client can hire")
		return
	}
	if status != "open" {
		writeErr(w, 409, "This job is no longer open")
		return
	}
	var dev int64
	if err := tx.QueryRow(`SELECT user_id FROM applications WHERE id = ? AND job_id = ?`, b.ApplicationID, id).Scan(&dev); err != nil {
		writeErr(w, 404, "application not found")
		return
	}
	if s.chainInfo != nil {
		var wallet sql.NullString
		tx.QueryRow(`SELECT wallet_address FROM users WHERE id = ?`, dev).Scan(&wallet)
		if !wallet.Valid {
			writeErr(w, 409, "This applicant has not linked a wallet yet, so they cannot be paid on-chain")
			return
		}
	}
	tx.Exec(`UPDATE applications SET status = CASE WHEN id = ? THEN 'accepted' ELSE 'declined' END WHERE job_id = ?`, b.ApplicationID, id)
	tx.Exec(`UPDATE jobs SET freelancer_id = ?, status = 'in_progress' WHERE id = ?`, dev, id)
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not hire")
		return
	}
	s.writeJobDetail(w, 200, id, uid)
}

func (s *Server) handleCancelJob(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	res, err := s.db.Exec(`UPDATE jobs SET status = 'cancelled' WHERE id = ? AND client_id = ? AND status = 'open'`, id, uid)
	if err != nil {
		writeErr(w, 500, "could not cancel job")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, 409, "Only your own open jobs can be cancelled")
		return
	}
	s.writeJobDetail(w, 200, id, uid)
}

// ---------- Milestone state machine ----------
//
//	pending -> funded -> submitted -> released
//	                 \-> refunded (client, after silence)   \-> released (freelancer claim, after client silence)
//	funded|submitted -> disputed -> resolved (arbiter splits the funds)
//
// The server mirrors what the escrow contract enforces; tx hashes are recorded as received.

var txHashRe = regexp.MustCompile(`^0x[0-9a-fA-F]{64}$`)

var deliverableRe = regexp.MustCompile(`^(https?://|ipfs://)\S{3,}$`)

func isTerminal(status string) bool {
	return status == "released" || status == "resolved" || status == "refunded"
}

func (s *Server) handleMilestoneAction(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	action := r.PathValue("action")
	var b struct {
		TxHash         string `json:"txHash"`
		DeliverableURL string `json:"deliverableUrl"`
		FreelancerPct  *int   `json:"freelancerPercent"`
	}
	if r.ContentLength != 0 && decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	if b.TxHash != "" && !txHashRe.MatchString(b.TxHash) {
		writeErr(w, 400, "txHash must be a 0x-prefixed 32-byte hash")
		return
	}
	if s.chainInfo != nil {
		s.handleChainMilestone(w, r, uid, id, action, b.TxHash, b.DeliverableURL)
		return
	}

	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not update milestone")
		return
	}
	defer tx.Rollback()

	var (
		jobID, clientID int64
		freelancerID    sql.NullInt64
		status          string
		fundedAt, subAt sql.NullString
	)
	err = tx.QueryRow(`SELECT m.job_id, m.status, m.funded_at, m.submitted_at, j.client_id, j.freelancer_id
		FROM milestones m JOIN jobs j ON j.id = m.job_id WHERE m.id = ? FOR UPDATE OF m`, id).
		Scan(&jobID, &status, &fundedAt, &subAt, &clientID, &freelancerID)
	if err != nil {
		writeErr(w, 404, "milestone not found")
		return
	}
	isClient := uid == clientID
	isFreelancer := freelancerID.Valid && uid == freelancerID.Int64

	deny := func(code int, msg string) { writeErr(w, code, msg) }
	wrongState := func() { deny(409, "This milestone is "+status+", so it cannot be "+action+"ed") }
	elapsed := func(since sql.NullString, days int) bool {
		t, err := time.Parse(time.RFC3339, since.String)
		return since.Valid && err == nil && time.Now().After(t.AddDate(0, 0, days))
	}

	var execErr error
	switch action {
	case "fund":
		switch {
		case !isClient:
			deny(403, "Only the client can fund a milestone")
			return
		case !freelancerID.Valid:
			deny(409, "Hire a freelancer before funding")
			return
		case status != "pending":
			wrongState()
			return
		}
		_, execErr = tx.Exec(`UPDATE milestones SET status='funded', funded_at=?, fund_tx=NULLIF(?, '') WHERE id=?`, now(), b.TxHash, id)
	case "submit":
		if !isFreelancer {
			deny(403, "Only the hired freelancer can submit work")
			return
		}
		if status != "funded" {
			wrongState()
			return
		}
		b.DeliverableURL = strings.TrimSpace(b.DeliverableURL)
		if !deliverableRe.MatchString(b.DeliverableURL) || len(b.DeliverableURL) > 500 {
			deny(400, "Provide a link to the deliverable (https:// or ipfs://)")
			return
		}
		_, execErr = tx.Exec(`UPDATE milestones SET status='submitted', submitted_at=?, deliverable_url=? WHERE id=?`, now(), b.DeliverableURL, id)
	case "approve":
		if !isClient {
			deny(403, "Only the client can approve work")
			return
		}
		if status != "submitted" {
			wrongState()
			return
		}
		_, execErr = tx.Exec(`UPDATE milestones SET status='released', resolved_at=?, freelancer_bps=10000, release_tx=NULLIF(?, '') WHERE id=?`, now(), b.TxHash, id)
	case "claim":
		if !isFreelancer {
			deny(403, "Only the hired freelancer can claim")
			return
		}
		if status != "submitted" {
			wrongState()
			return
		}
		if !elapsed(subAt, s.cfg.ClaimAfterDays) {
			deny(409, "The client still has time to review this milestone")
			return
		}
		_, execErr = tx.Exec(`UPDATE milestones SET status='released', resolved_at=?, freelancer_bps=10000, release_tx=NULLIF(?, '') WHERE id=?`, now(), b.TxHash, id)
	case "refund":
		if !isClient {
			deny(403, "Only the client can reclaim funds")
			return
		}
		if status != "funded" {
			wrongState()
			return
		}
		if !elapsed(fundedAt, s.cfg.RefundAfterDays) {
			deny(409, "The freelancer still has time to submit this milestone")
			return
		}
		_, execErr = tx.Exec(`UPDATE milestones SET status='refunded', resolved_at=?, freelancer_bps=0, release_tx=NULLIF(?, '') WHERE id=?`, now(), b.TxHash, id)
	case "dispute":
		if !isClient && !isFreelancer {
			deny(403, "Only the client or freelancer can open a dispute")
			return
		}
		if status != "funded" && status != "submitted" {
			wrongState()
			return
		}
		_, execErr = tx.Exec(`UPDATE milestones SET status='disputed' WHERE id=?`, id)
	case "resolve":
		// Read inside the transaction: the pool has a single connection, so s.db would deadlock here.
		var email sql.NullString
		tx.QueryRow(`SELECT email FROM users WHERE id = ?`, uid).Scan(&email)
		if !email.Valid || !s.cfg.AdminEmails[strings.ToLower(email.String)] {
			deny(403, "Only the platform arbiter can resolve disputes")
			return
		}
		if status != "disputed" {
			wrongState()
			return
		}
		if b.FreelancerPct == nil || *b.FreelancerPct < 0 || *b.FreelancerPct > 100 {
			deny(400, "freelancerPercent must be between 0 and 100")
			return
		}
		_, execErr = tx.Exec(`UPDATE milestones SET status='resolved', resolved_at=?, freelancer_bps=?, release_tx=NULLIF(?, '') WHERE id=?`,
			now(), *b.FreelancerPct*100, b.TxHash, id)
	default:
		deny(404, "unknown action")
		return
	}
	if execErr != nil {
		writeErr(w, 500, "could not update milestone")
		return
	}

	closeJobIfDone(tx, jobID, freelancerID)
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not update milestone")
		return
	}
	s.writeJobDetail(w, 200, jobID, uid)
}

// ---------- Job chat ----------

type Message struct {
	ID        int64  `json:"id"`
	Sender    Party  `json:"sender"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

func (s *Server) isParticipant(jobID, uid int64) bool {
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM jobs WHERE id = ? AND (client_id = ? OR freelancer_id = ?)`, jobID, uid, uid).Scan(&n)
	return n > 0
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if !s.isParticipant(id, uid) {
		writeErr(w, 403, "Only the client and hired freelancer can read this chat")
		return
	}
	rows, err := s.db.Query(`SELECT m.id, m.sender_id, u.name, m.body, m.created_at FROM messages m
		JOIN users u ON u.id = m.sender_id WHERE m.job_id = ? ORDER BY m.id`, id)
	if err != nil {
		writeErr(w, 500, "could not load messages")
		return
	}
	defer rows.Close()
	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.Sender.ID, &m.Sender.Name, &m.Body, &m.CreatedAt); err != nil {
			writeErr(w, 500, "could not load messages")
			return
		}
		out = append(out, m)
	}
	writeJSON(w, 200, out)
}

func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if !s.isParticipant(id, uid) {
		writeErr(w, 403, "Only the client and hired freelancer can post here")
		return
	}
	var b struct {
		Body string `json:"body"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	b.Body = strings.TrimSpace(b.Body)
	if b.Body == "" || len(b.Body) > 2000 {
		writeErr(w, 400, "Message must be 1 to 2000 characters")
		return
	}
	mid, err := insertID(s.db, `INSERT INTO messages (job_id, sender_id, body) VALUES (?,?,?)`, id, uid, b.Body)
	if err != nil {
		writeErr(w, 500, "could not send message")
		return
	}
	var m Message
	s.db.QueryRow(`SELECT m.id, m.sender_id, u.name, m.body, m.created_at FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`, mid).
		Scan(&m.ID, &m.Sender.ID, &m.Sender.Name, &m.Body, &m.CreatedAt)
	writeJSON(w, 201, m)
}
