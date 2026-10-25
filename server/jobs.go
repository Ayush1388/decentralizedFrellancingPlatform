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
	SubmissionNote string  `json:"submissionNote"`
	Feedback       string  `json:"feedback"` // the client's last change request
	DisputeReason  string  `json:"disputeReason"`
	Revisions      int     `json:"revisions"`
	FundTx         *string `json:"fundTx"`
	ReleaseTx      *string `json:"releaseTx"`
	FundedAt       *string `json:"fundedAt"`
	SubmittedAt    *string `json:"submittedAt"`
	FreelancerBps  *int    `json:"freelancerBps"`
	ClaimableAt    *string `json:"claimableAt"`  // freelancer may claim after this if the client stays silent
	RefundableAt   *string `json:"refundableAt"` // client may reclaim after this if nothing was submitted
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
	Demo        bool     `json:"demo"`
	Openings    int      `json:"openings"`
	Hired       int      `json:"hired"`
	ClosesAt    *string  `json:"closesAt"`
	Duration    string   `json:"duration"`
	Level       string   `json:"level"`
	ParentID    *int64   `json:"parentId"`
}

type Contract struct {
	ID         int64  `json:"id"`
	Freelancer Party  `json:"freelancer"`
	Status     string `json:"status"`
}

type Event struct {
	Kind      string `json:"kind"`
	Detail    string `json:"detail"`
	Actor     *Party `json:"actor"`
	CreatedAt string `json:"createdAt"`
}

type Review struct {
	Rating    int    `json:"rating"`
	Comment   string `json:"comment"`
	CreatedAt string `json:"createdAt"`
}

type JobDetail struct {
	JobSummary
	Milestones       []Milestone   `json:"milestones"`
	ViewerRole       string        `json:"viewerRole"`
	Applications     []Application `json:"applications,omitempty"`
	MyApplication    *Application  `json:"myApplication,omitempty"`
	Contracts        []Contract    `json:"contracts,omitempty"`
	Events           []Event       `json:"events,omitempty"`
	Review           *Review       `json:"review"`
	ParentTitle      string        `json:"parentTitle,omitempty"`
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
       (SELECT COUNT(*) FROM applications WHERE job_id = j.id),
       c.is_demo, j.openings,
       (SELECT COUNT(*) FROM applications WHERE job_id = j.id AND status = 'accepted'),
       j.closes_at, j.duration, j.level, j.parent_id
FROM jobs j
JOIN users c ON c.id = j.client_id
LEFT JOIN users f ON f.id = j.freelancer_id`

func scanJob(r rowScanner) (JobSummary, error) {
	var j JobSummary
	var skills string
	var fid sql.NullInt64
	var fname sql.NullString
	err := r.Scan(&j.ID, &j.Title, &j.Description, &skills, &j.Status, &j.CreatedAt,
		&j.Client.ID, &j.Client.Name, &fid, &fname, &j.Total, &j.Applicants,
		&j.Demo, &j.Openings, &j.Hired, &j.ClosesAt, &j.Duration, &j.Level, &j.ParentID)
	j.Skills = parseSkills(skills)
	if fid.Valid {
		j.Freelancer = &Party{ID: fid.Int64, Name: fname.String}
	}
	return j, err
}

// acceptingApplications reports whether a job still takes applications right now.
func acceptingApplications(status string, closesAt *string) bool {
	if status != "open" {
		return false
	}
	if closesAt == nil {
		return true
	}
	t, err := time.Parse(time.RFC3339, *closesAt)
	return err != nil || time.Now().Before(t)
}

func (s *Server) handleListJobs(w http.ResponseWriter, r *http.Request) {
	q := jobSelect
	var where []string
	var args []any
	if st := r.URL.Query().Get("status"); st != "" {
		where = append(where, "j.status = ?")
		args = append(args, st)
		if st == "open" { // the public board only lists postings that still take applications
			where = append(where, "(j.closes_at IS NULL OR j.closes_at > now())")
		}
	}
	if term := strings.TrimSpace(r.URL.Query().Get("q")); term != "" {
		like := "%" + term + "%"
		where = append(where, "(j.title ILIKE ? OR j.description ILIKE ? OR j.skills::text ILIKE ?)")
		args = append(args, like, like, like)
	}
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY j.created_at DESC, j.id DESC LIMIT 100"
	s.writeJobList(w, q, args...)
}

func (s *Server) handleMyJobs(w http.ResponseWriter, r *http.Request, uid int64) {
	s.writeJobList(w, jobSelect+` WHERE j.client_id = ? OR j.freelancer_id = ?
		OR j.id IN (SELECT job_id FROM applications WHERE user_id = ?) ORDER BY j.created_at DESC, j.id DESC`, uid, uid, uid)
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

var (
	durations = map[string]bool{"": true, "Less than a week": true, "1 to 4 weeks": true, "1 to 3 months": true, "More than 3 months": true}
	levels    = map[string]bool{"": true, "Entry": true, "Intermediate": true, "Expert": true}
)

func (s *Server) handleCreateJob(w http.ResponseWriter, r *http.Request, uid int64) {
	var b struct {
		Title       string           `json:"title"`
		Description string           `json:"description"`
		Skills      []string         `json:"skills"`
		Milestones  []milestoneInput `json:"milestones"`
		Openings    int              `json:"openings"`
		OpenDays    int              `json:"openDays"` // how long applications stay open
		Duration    string           `json:"duration"`
		Level       string           `json:"level"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	b.Title, b.Description = strings.TrimSpace(b.Title), strings.TrimSpace(b.Description)
	if b.Openings == 0 {
		b.Openings = 1
	}
	if b.OpenDays == 0 {
		b.OpenDays = 14
	}
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
	case b.Openings < 1 || b.Openings > 20:
		writeErr(w, 400, "Openings must be between 1 and 20")
		return
	case b.OpenDays < 1 || b.OpenDays > 60:
		writeErr(w, 400, "Applications can stay open for 1 to 60 days")
		return
	case !durations[b.Duration]:
		writeErr(w, 400, "Pick one of the listed durations")
		return
	case !levels[b.Level]:
		writeErr(w, 400, "Pick one of the listed experience levels")
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
	jobID, err := insertID(tx, `INSERT INTO jobs (client_id, title, description, skills, openings, closes_at, duration, level) VALUES (?,?,?,?::jsonb,?,?,?,?)`,
		uid, b.Title, b.Description, skillsJSON(b.Skills), b.Openings, now().AddDate(0, 0, b.OpenDays), b.Duration, b.Level)
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
	logEvent(tx, jobID, uid, "posted", "")
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

	d.ViewerRole = "visitor"
	switch {
	case viewer == 0:
	case viewer == d.Client.ID:
		d.ViewerRole = "client"
	case d.Freelancer != nil && viewer == d.Freelancer.ID:
		d.ViewerRole = "freelancer"
	}
	participant := d.ViewerRole == "client" || d.ViewerRole == "freelancer"
	insider := participant || (viewer != 0 && s.isAdminUser(viewer))

	rows, err := s.db.Query(`SELECT id, position, title, amount, status, deliverable_url, submission_note, feedback, dispute_reason, revisions,
		fund_tx, release_tx, funded_at, submitted_at, freelancer_bps
		FROM milestones WHERE job_id = ? ORDER BY position`, id)
	if err != nil {
		return d, err
	}
	for rows.Next() {
		var m Milestone
		if err := rows.Scan(&m.ID, &m.Position, &m.Title, &m.Amount, &m.Status, &m.DeliverableURL, &m.SubmissionNote, &m.Feedback, &m.DisputeReason, &m.Revisions,
			&m.FundTx, &m.ReleaseTx, &m.FundedAt, &m.SubmittedAt, &m.FreelancerBps); err != nil {
			rows.Close()
			return d, err
		}
		if m.Status == "submitted" && m.SubmittedAt != nil {
			m.ClaimableAt = addDays(*m.SubmittedAt, s.cfg.ClaimAfterDays)
		}
		if m.Status == "funded" && m.FundedAt != nil {
			m.RefundableAt = addDays(*m.FundedAt, s.cfg.RefundAfterDays)
		}
		if !insider { // the work itself and the conversation about it stay between the two parties
			m.DeliverableURL, m.SubmissionNote, m.Feedback, m.DisputeReason = nil, "", "", ""
		}
		d.Milestones = append(d.Milestones, m)
	}
	rows.Close()

	s.db.QueryRow(`SELECT escrow_id FROM jobs WHERE id = ?`, id).Scan(&d.EscrowID)
	if participant {
		s.db.QueryRow(`SELECT wallet_address FROM users WHERE id = ?`, d.Client.ID).Scan(&d.ClientWallet)
		if d.Freelancer != nil {
			s.db.QueryRow(`SELECT wallet_address FROM users WHERE id = ?`, d.Freelancer.ID).Scan(&d.FreelancerWallet)
		}
	}
	if d.ParentID != nil {
		s.db.QueryRow(`SELECT title FROM jobs WHERE id = ?`, *d.ParentID).Scan(&d.ParentTitle)
	}

	if d.ViewerRole == "client" {
		if d.Applications, err = s.loadApplications(`a.job_id = ? ORDER BY CASE a.status WHEN 'accepted' THEN 0 WHEN 'shortlisted' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, a.id`, id); err != nil {
			return d, err
		}
		crow, err := s.db.Query(`SELECT j.id, u.id, u.name, j.status FROM jobs j JOIN users u ON u.id = j.freelancer_id WHERE j.parent_id = ? ORDER BY j.id`, id)
		if err != nil {
			return d, err
		}
		for crow.Next() {
			var c Contract
			crow.Scan(&c.ID, &c.Freelancer.ID, &c.Freelancer.Name, &c.Status)
			d.Contracts = append(d.Contracts, c)
		}
		crow.Close()
	} else if viewer != 0 {
		// An applicant applied to this posting, or to the parent posting of this contract.
		mine, err := s.loadApplications(`a.job_id = ? AND a.user_id = ?`, id, viewer)
		if err != nil {
			return d, err
		}
		if len(mine) == 1 {
			d.MyApplication = &mine[0]
			if d.ViewerRole == "visitor" {
				d.ViewerRole = "applicant"
			}
		}
	}

	if insider {
		erow, err := s.db.Query(`SELECT e.kind, e.detail, e.created_at, u.id, u.name FROM job_events e LEFT JOIN users u ON u.id = e.actor_id
			WHERE e.job_id = ? ORDER BY e.created_at DESC, e.id DESC LIMIT 50`, id)
		if err != nil {
			return d, err
		}
		for erow.Next() {
			var e Event
			var aid sql.NullInt64
			var aname sql.NullString
			erow.Scan(&e.Kind, &e.Detail, &e.CreatedAt, &aid, &aname)
			if aid.Valid {
				e.Actor = &Party{ID: aid.Int64, Name: aname.String}
			}
			d.Events = append(d.Events, e)
		}
		erow.Close()
	}

	var rv Review
	if s.db.QueryRow(`SELECT rating, comment, created_at FROM reviews WHERE job_id = ?`, id).Scan(&rv.Rating, &rv.Comment, &rv.CreatedAt) == nil {
		d.Review = &rv
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

// logEvent appends to a job's activity log. Failures are ignored: the log is informational.
func logEvent(tx *Tx, jobID, actor int64, kind, detail string) {
	var a any
	if actor != 0 {
		a = actor
	}
	tx.Exec(`INSERT INTO job_events (job_id, actor_id, kind, detail) VALUES (?,?,?,?)`, jobID, a, kind, detail)
}

// handleHire accepts one application. A posting with a single opening becomes the contract
// itself; with several openings, each hire gets its own contract (a child job with a copy
// of the milestones) so every freelancer has their own escrow, chat and payouts.
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
	var (
		client            int64
		status, title     string
		desc, skills, dur string
		level             string
		openings          int
	)
	if err := tx.QueryRow(`SELECT client_id, status, openings, title, description, skills::text, duration, level FROM jobs WHERE id = ? FOR UPDATE`, id).
		Scan(&client, &status, &openings, &title, &desc, &skills, &dur, &level); err != nil {
		writeErr(w, 404, "job not found")
		return
	}
	if client != uid {
		writeErr(w, 403, "Only the client can hire")
		return
	}
	if status != "open" {
		writeErr(w, 409, "This job is no longer hiring")
		return
	}
	var dev int64
	var appStatus, devName string
	if err := tx.QueryRow(`SELECT a.user_id, a.status, u.name FROM applications a JOIN users u ON u.id = a.user_id WHERE a.id = ? AND a.job_id = ?`, b.ApplicationID, id).
		Scan(&dev, &appStatus, &devName); err != nil {
		writeErr(w, 404, "application not found")
		return
	}
	if appStatus != "pending" && appStatus != "shortlisted" {
		writeErr(w, 409, "This application is "+appStatus+", so it cannot be hired")
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

	tx.Exec(`UPDATE applications SET status = 'accepted' WHERE id = ?`, b.ApplicationID)
	logEvent(tx, id, uid, "hired", devName)
	if openings <= 1 {
		tx.Exec(`UPDATE applications SET status = 'declined' WHERE job_id = ? AND status IN ('pending','shortlisted')`, id)
		tx.Exec(`UPDATE jobs SET freelancer_id = ?, status = 'in_progress' WHERE id = ?`, dev, id)
	} else {
		cid, err := insertID(tx, `INSERT INTO jobs (client_id, freelancer_id, title, description, skills, status, openings, duration, level, parent_id)
			VALUES (?,?,?,?,?::jsonb,'in_progress',1,?,?,?)`, uid, dev, title, desc, skills, dur, level, id)
		if err != nil {
			writeErr(w, 500, "could not create the contract")
			return
		}
		if _, err := tx.Exec(`INSERT INTO milestones (job_id, position, title, amount) SELECT ?, position, title, amount FROM milestones WHERE job_id = ? ORDER BY position`, cid, id); err != nil {
			writeErr(w, 500, "could not create the contract")
			return
		}
		logEvent(tx, cid, uid, "hired", devName)
		var hired int
		tx.QueryRow(`SELECT COUNT(*) FROM applications WHERE job_id = ? AND status = 'accepted'`, id).Scan(&hired)
		if hired >= openings {
			tx.Exec(`UPDATE applications SET status = 'declined' WHERE job_id = ? AND status IN ('pending','shortlisted')`, id)
			tx.Exec(`UPDATE jobs SET status = 'filled' WHERE id = ?`, id)
			logEvent(tx, id, 0, "filled", "")
		}
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not hire")
		return
	}
	s.writeJobDetail(w, 200, id, uid)
}

// handleCancelJob closes a posting, or ends a contract before any money moved.
func (s *Server) handleCancelJob(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not cancel job")
		return
	}
	defer tx.Rollback()
	var client int64
	var status string
	if err := tx.QueryRow(`SELECT client_id, status FROM jobs WHERE id = ? FOR UPDATE`, id).Scan(&client, &status); err != nil {
		writeErr(w, 404, "job not found")
		return
	}
	if client != uid {
		writeErr(w, 403, "Only the client can cancel this job")
		return
	}
	var touched int
	tx.QueryRow(`SELECT COUNT(*) FROM milestones WHERE job_id = ? AND status <> 'pending'`, id).Scan(&touched)
	switch {
	case status == "open" || status == "filled":
	case status == "in_progress" && touched == 0:
	case status == "in_progress":
		writeErr(w, 409, "Money has already moved on this job. Finish, refund or dispute the funded milestones instead.")
		return
	default:
		writeErr(w, 409, "This job is already "+status)
		return
	}
	tx.Exec(`UPDATE jobs SET status = 'cancelled' WHERE id = ?`, id)
	tx.Exec(`UPDATE applications SET status = 'declined' WHERE job_id = ? AND status IN ('pending','shortlisted')`, id)
	logEvent(tx, id, uid, "cancelled", "")
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not cancel job")
		return
	}
	s.writeJobDetail(w, 200, id, uid)
}

// ---------- Milestone state machine ----------
//
//	pending -> funded -> submitted -> released
//	              ^          |  \-> released (freelancer claim, after client silence)
//	              \- revise -/
//	funded -> refunded (client, after silence)
//	funded|submitted -> disputed -> resolved (arbiter splits the funds)
//
// The server mirrors what the escrow contract enforces; tx hashes are recorded as received.

var txHashRe = regexp.MustCompile(`^0x[0-9a-fA-F]{64}$`)

var deliverableRe = regexp.MustCompile(`^(https?://|ipfs://)\S{3,}$`)

func isTerminal(status string) bool {
	return status == "released" || status == "resolved" || status == "refunded"
}

type milestoneBody struct {
	TxHash         string `json:"txHash"`
	DeliverableURL string `json:"deliverableUrl"`
	Note           string `json:"note"`     // submit: what was delivered
	Feedback       string `json:"feedback"` // revise: what needs to change
	Reason         string `json:"reason"`   // dispute: why
	FreelancerPct  *int   `json:"freelancerPercent"`
}

func (s *Server) handleMilestoneAction(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	action := r.PathValue("action")
	var b milestoneBody
	if r.ContentLength != 0 && decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	if b.TxHash != "" && !txHashRe.MatchString(b.TxHash) {
		writeErr(w, 400, "txHash must be a 0x-prefixed 32-byte hash")
		return
	}
	b.Note, b.Feedback, b.Reason = strings.TrimSpace(b.Note), strings.TrimSpace(b.Feedback), strings.TrimSpace(b.Reason)
	switch {
	case len(b.Note) > 1000:
		writeErr(w, 400, "Keep the delivery note under 1000 characters")
		return
	case action == "dispute" && (len(b.Reason) < 10 || len(b.Reason) > 1000):
		writeErr(w, 400, "Explain the dispute in 10 to 1000 characters so the arbiter can rule on it")
		return
	case action == "revise" && (len(b.Feedback) < 10 || len(b.Feedback) > 1000):
		writeErr(w, 400, "Describe the changes you need in 10 to 1000 characters")
		return
	}
	if s.chainInfo != nil {
		if action == "revise" {
			writeErr(w, 409, "The escrow contract has no change-request step. Ask for changes in the chat, or open a dispute.")
			return
		}
		s.handleChainMilestone(w, r, uid, id, action, b)
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
		status, title   string
		fundedAt, subAt sql.NullString
	)
	err = tx.QueryRow(`SELECT m.job_id, m.status, m.title, m.funded_at, m.submitted_at, j.client_id, j.freelancer_id
		FROM milestones m JOIN jobs j ON j.id = m.job_id WHERE m.id = ? FOR UPDATE OF m`, id).
		Scan(&jobID, &status, &title, &fundedAt, &subAt, &clientID, &freelancerID)
	if err != nil {
		writeErr(w, 404, "milestone not found")
		return
	}
	isClient := uid == clientID
	isFreelancer := freelancerID.Valid && uid == freelancerID.Int64

	deny := func(code int, msg string) { writeErr(w, code, msg) }
	wrongState := func() { deny(409, "This milestone is "+status+", so that is not possible right now") }
	elapsed := func(since sql.NullString, days int) bool {
		t, err := time.Parse(time.RFC3339, since.String)
		return since.Valid && err == nil && time.Now().After(t.AddDate(0, 0, days))
	}

	var execErr error
	detail := title
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
		_, execErr = tx.Exec(`UPDATE milestones SET status='submitted', submitted_at=?, deliverable_url=?, submission_note=? WHERE id=?`, now(), b.DeliverableURL, b.Note, id)
	case "revise":
		if !isClient {
			deny(403, "Only the client can request changes")
			return
		}
		if status != "submitted" {
			wrongState()
			return
		}
		// Back to funded. The refund clock restarts so a change request can never be
		// turned into an instant refund of work the freelancer is now redoing.
		_, execErr = tx.Exec(`UPDATE milestones SET status='funded', funded_at=?, submitted_at=NULL, feedback=?, revisions=revisions+1 WHERE id=?`, now(), b.Feedback, id)
		detail = title + ": " + b.Feedback
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
		_, execErr = tx.Exec(`UPDATE milestones SET status='disputed', dispute_reason=? WHERE id=?`, b.Reason, id)
		detail = title + ": " + b.Reason
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

	logEvent(tx, jobID, uid, eventKind[action], detail)
	closeJobIfDone(tx, jobID, freelancerID)
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not update milestone")
		return
	}
	s.writeJobDetail(w, 200, jobID, uid)
}

var eventKind = map[string]string{
	"fund": "funded", "submit": "submitted", "revise": "changes_requested", "approve": "approved",
	"claim": "claimed", "refund": "refunded", "dispute": "disputed", "resolve": "resolved",
}

// ---------- Job chat (client and hired freelancer) ----------

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
	s.writeMessages(w, `m.job_id = ? AND m.application_id IS NULL`, id)
}

func (s *Server) writeMessages(w http.ResponseWriter, where string, args ...any) {
	rows, err := s.db.Query(`SELECT m.id, m.sender_id, u.name, m.body, m.created_at FROM messages m
		JOIN users u ON u.id = m.sender_id WHERE `+where+` ORDER BY m.id`, args...)
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
	s.postMessage(w, r, uid, id, nil)
}

func (s *Server) postMessage(w http.ResponseWriter, r *http.Request, uid, jobID int64, appID any) {
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
	mid, err := insertID(s.db, `INSERT INTO messages (job_id, sender_id, body, application_id) VALUES (?,?,?,?)`, jobID, uid, b.Body, appID)
	if err != nil {
		writeErr(w, 500, "could not send message")
		return
	}
	var m Message
	s.db.QueryRow(`SELECT m.id, m.sender_id, u.name, m.body, m.created_at FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`, mid).
		Scan(&m.ID, &m.Sender.ID, &m.Sender.Name, &m.Body, &m.CreatedAt)
	writeJSON(w, 201, m)
}
