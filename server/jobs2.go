package main

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"strconv"
	"strings"
)

type milestoneInput struct {
	Title  string  `json:"title"`
	Amount float64 `json:"amount"` // USDC
}

var (
	durations = map[string]bool{"": true, "Less than a week": true, "1 to 4 weeks": true, "1 to 3 months": true, "More than 3 months": true}
	levels    = map[string]bool{"": true, "Entry": true, "Intermediate": true, "Expert": true}
)

const minMilestone = 10_000 // 0.01 USDC in base units

type jobInput struct {
	Title       string           `json:"title"`
	Description string           `json:"description"`
	Skills      []string         `json:"skills"`
	Milestones  []milestoneInput `json:"milestones"`
	Openings    int              `json:"openings"`
	OpenDays    int              `json:"openDays"` // how long applications stay open
	Duration    string           `json:"duration"`
	Level       string           `json:"level"`
	Category    string           `json:"category"`
	Draft       bool             `json:"draft"`
	ExtendDays  int              `json:"extendDays"` // update only: reopen or extend applications from today
}

// validate cleans the input in place and returns the milestone amounts in USDC base units.
func (b *jobInput) validate() ([]int64, string) {
	b.Title, b.Description = strings.TrimSpace(b.Title), strings.TrimSpace(b.Description)
	if b.Openings == 0 {
		b.Openings = 1
	}
	if b.OpenDays == 0 {
		b.OpenDays = 14
	}
	switch {
	case len(b.Title) < 5 || len(b.Title) > 120:
		return nil, "Title must be 5 to 120 characters"
	case len(b.Description) < 20 || len(b.Description) > 5000:
		return nil, "Description must be 20 to 5000 characters"
	case len(b.Milestones) < 1 || len(b.Milestones) > 10:
		return nil, "Add between 1 and 10 milestones"
	case b.Openings < 1 || b.Openings > 20:
		return nil, "Openings must be between 1 and 20"
	case b.OpenDays < 1 || b.OpenDays > 60:
		return nil, "Applications can stay open for 1 to 60 days"
	case b.ExtendDays < 0 || b.ExtendDays > 60:
		return nil, "You can extend applications by 1 to 60 days"
	case !durations[b.Duration]:
		return nil, "Pick one of the listed durations"
	case !levels[b.Level]:
		return nil, "Pick one of the listed experience levels"
	case !validCategory(b.Category):
		return nil, "Pick one of the listed categories"
	}
	amounts, msg := milestoneAmounts(b.Milestones)
	return amounts, msg
}

func milestoneAmounts(ms []milestoneInput) ([]int64, string) {
	if len(ms) < 1 || len(ms) > 10 {
		return nil, "Add between 1 and 10 milestones"
	}
	amounts := make([]int64, len(ms))
	for i, m := range ms {
		m.Title = strings.TrimSpace(m.Title)
		ms[i].Title = m.Title
		if m.Title == "" || len(m.Title) > 100 {
			return nil, "Every milestone needs a title under 100 characters"
		}
		if math.IsNaN(m.Amount) || m.Amount < 1 || m.Amount > 1_000_000 {
			return nil, "Milestone amounts must be between 1 and 1,000,000 USDC"
		}
		amounts[i] = int64(math.Round(m.Amount * usdcUnit))
	}
	return amounts, ""
}

func (s *Server) handleCreateJob(w http.ResponseWriter, r *http.Request, uid int64) {
	if !s.mustBeVerified(w, uid) {
		return
	}
	var b jobInput
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	amounts, msg := b.validate()
	if msg != "" {
		writeErr(w, 400, msg)
		return
	}
	status := "open"
	var closes any = now().AddDate(0, 0, b.OpenDays)
	if b.Draft {
		status, closes = "draft", nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not create job")
		return
	}
	defer tx.Rollback()
	jobID, err := insertID(tx, `INSERT INTO jobs (client_id, title, description, skills, openings, closes_at, duration, level, category, open_days, status)
		VALUES (?,?,?,?::jsonb,?,?,?,?,?,?,?)`,
		uid, b.Title, b.Description, skillsJSON(b.Skills), b.Openings, closes, b.Duration, b.Level, b.Category, b.OpenDays, status)
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
	if !b.Draft {
		logEvent(tx, jobID, uid, "posted", "")
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not create job")
		return
	}
	s.writeJobDetail(w, 201, jobID, uid)
}

// ownedJob loads a job the caller owns as client, writing the error response itself when they do not.
func (s *Server) ownedJob(w http.ResponseWriter, r *http.Request, uid int64) (id int64, status string, freelancer sql.NullInt64, ok bool) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var client int64
	if s.db.QueryRow(`SELECT client_id, status, freelancer_id FROM jobs WHERE id = ?`, id).Scan(&client, &status, &freelancer) != nil {
		writeErr(w, 404, "job not found")
		return
	}
	if client != uid {
		writeErr(w, 403, "Only the client can change this job")
		return
	}
	return id, status, freelancer, true
}

// handleUpdateJob edits a draft or an open posting. What applicants applied against (the milestones) can only
// change while nobody has applied; everything else can be fixed at any time, and applicants are told.
func (s *Server) handleUpdateJob(w http.ResponseWriter, r *http.Request, uid int64) {
	id, status, _, ok := s.ownedJob(w, r, uid)
	if !ok {
		return
	}
	if status != "draft" && status != "open" {
		writeErr(w, 409, "Only drafts and open postings can be edited")
		return
	}
	var b jobInput
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	amounts, msg := b.validate()
	if msg != "" {
		writeErr(w, 400, msg)
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not save the job")
		return
	}
	defer tx.Rollback()
	var applied, hired int
	tx.QueryRow(`SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'accepted') FROM applications WHERE job_id = ?`, id).Scan(&applied, &hired)
	if b.Openings < hired || (hired > 0 && b.Openings < 1) {
		writeErr(w, 409, fmt.Sprintf("%d people are already hired, so there must be at least %d openings", hired, hired))
		return
	}

	// Compare the milestones with what is stored.
	rows, _ := tx.Query(`SELECT title, amount FROM milestones WHERE job_id = ? ORDER BY position`, id)
	changed := false
	i := 0
	for rows != nil && rows.Next() {
		var t string
		var a int64
		rows.Scan(&t, &a)
		if i >= len(b.Milestones) || b.Milestones[i].Title != t || amounts[i] != a {
			changed = true
		}
		i++
	}
	if rows != nil {
		rows.Close()
	}
	if i != len(b.Milestones) {
		changed = true
	}
	if changed && applied > 0 {
		writeErr(w, 409, "People have already applied against these milestones, so they cannot change. Close this posting and repost it with the new ones.")
		return
	}
	if _, err := tx.Exec(`UPDATE jobs SET title=?, description=?, skills=?::jsonb, openings=?, duration=?, level=?, category=?, open_days=?, edited_at=now() WHERE id=?`,
		b.Title, b.Description, skillsJSON(b.Skills), b.Openings, b.Duration, b.Level, b.Category, b.OpenDays, id); err != nil {
		writeErr(w, 500, "could not save the job")
		return
	}
	if changed {
		tx.Exec(`DELETE FROM milestones WHERE job_id = ?`, id)
		for i, m := range b.Milestones {
			if _, err := tx.Exec(`INSERT INTO milestones (job_id, position, title, amount) VALUES (?,?,?,?)`, id, i+1, m.Title, amounts[i]); err != nil {
				writeErr(w, 500, "could not save the milestones")
				return
			}
		}
	}
	if status == "open" && b.ExtendDays > 0 {
		tx.Exec(`UPDATE jobs SET closes_at = now() + (? || ' days')::interval WHERE id = ?`, strconv.Itoa(b.ExtendDays), id)
	}
	if status == "open" {
		logEvent(tx, id, uid, "edited", "")
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not save the job")
		return
	}
	s.writeJobDetail(w, 200, id, uid)
}

func (s *Server) handlePublishJob(w http.ResponseWriter, r *http.Request, uid int64) {
	id, status, _, ok := s.ownedJob(w, r, uid)
	if !ok {
		return
	}
	if status != "draft" {
		writeErr(w, 409, "This job is already published")
		return
	}
	if !s.mustBeVerified(w, uid) {
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not publish")
		return
	}
	defer tx.Rollback()
	tx.Exec(`UPDATE jobs SET status = 'open', closes_at = now() + (open_days || ' days')::interval, created_at = now() WHERE id = ?`, id)
	logEvent(tx, id, uid, "posted", "")
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not publish")
		return
	}
	s.writeJobDetail(w, 200, id, uid)
}

// handleRepostJob copies a posting into a new draft: same brief and milestones, nobody has applied yet.
func (s *Server) handleRepostJob(w http.ResponseWriter, r *http.Request, uid int64) {
	id, _, _, ok := s.ownedJob(w, r, uid)
	if !ok {
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not repost")
		return
	}
	defer tx.Rollback()
	nid, err := insertID(tx, `INSERT INTO jobs (client_id, title, description, skills, openings, duration, level, category, open_days, status)
		SELECT client_id, title, description, skills, openings, duration, level, category, open_days, 'draft' FROM jobs WHERE id = ?`, id)
	if err != nil {
		writeErr(w, 500, "could not repost")
		return
	}
	if _, err := tx.Exec(`INSERT INTO milestones (job_id, position, title, amount) SELECT ?, position, title, amount FROM milestones WHERE job_id = ?`, nid, id); err != nil {
		writeErr(w, 500, "could not repost")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not repost")
		return
	}
	s.writeJobDetail(w, 201, nid, uid)
}

// handleSetMilestones renegotiates the milestones of a hired contract, but only before any money is in play.
func (s *Server) handleSetMilestones(w http.ResponseWriter, r *http.Request, uid int64) {
	id, status, freelancer, ok := s.ownedJob(w, r, uid)
	if !ok {
		return
	}
	if status != "in_progress" || !freelancer.Valid {
		writeErr(w, 409, "Milestones of a hired contract can be changed before funding")
		return
	}
	var b struct {
		Milestones []milestoneInput `json:"milestones"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	amounts, msg := milestoneAmounts(b.Milestones)
	if msg != "" {
		writeErr(w, 400, msg)
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not save")
		return
	}
	defer tx.Rollback()
	var touched int
	var escrow sql.NullInt64
	tx.QueryRow(`SELECT COUNT(*) FROM milestones WHERE job_id = ? AND status <> 'pending'`, id).Scan(&touched)
	tx.QueryRow(`SELECT escrow_id FROM jobs WHERE id = ? FOR UPDATE`, id).Scan(&escrow)
	if touched > 0 || escrow.Valid {
		writeErr(w, 409, "Money is already in play on this contract, so its milestones are locked. Add a follow-up contract for new work.")
		return
	}
	tx.Exec(`DELETE FROM milestones WHERE job_id = ?`, id)
	for i, m := range b.Milestones {
		if _, err := tx.Exec(`INSERT INTO milestones (job_id, position, title, amount) VALUES (?,?,?,?)`, id, i+1, m.Title, amounts[i]); err != nil {
			writeErr(w, 500, "could not save")
			return
		}
	}
	logEvent(tx, id, uid, "scope_changed", "")
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not save")
		return
	}
	s.writeJobDetail(w, 200, id, uid)
}

// handleFollowup adds new work with the same freelancer as its own contract (so it gets its own escrow),
// for scope that grew, an extra milestone, or a bonus.
func (s *Server) handleFollowup(w http.ResponseWriter, r *http.Request, uid int64) {
	id, status, freelancer, ok := s.ownedJob(w, r, uid)
	if !ok {
		return
	}
	if (status != "in_progress" && status != "completed") || !freelancer.Valid {
		writeErr(w, 409, "Follow-up work needs a hired freelancer")
		return
	}
	var b struct {
		Title       string           `json:"title"`
		Description string           `json:"description"`
		Milestones  []milestoneInput `json:"milestones"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	b.Title, b.Description = strings.TrimSpace(b.Title), strings.TrimSpace(b.Description)
	if len(b.Title) < 5 || len(b.Title) > 120 {
		writeErr(w, 400, "Title must be 5 to 120 characters")
		return
	}
	if b.Description == "" {
		b.Description = "Follow-up work on the original contract."
	}
	amounts, msg := milestoneAmounts(b.Milestones)
	if msg != "" {
		writeErr(w, 400, msg)
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not add the contract")
		return
	}
	defer tx.Rollback()
	cid, err := insertID(tx, `INSERT INTO jobs (client_id, freelancer_id, title, description, skills, status, openings, duration, level, category, parent_id)
		SELECT client_id, freelancer_id, ?, ?, skills, 'in_progress', 1, duration, level, category, ? FROM jobs WHERE id = ?`, b.Title, b.Description, id, id)
	if err != nil {
		writeErr(w, 500, "could not add the contract")
		return
	}
	for i, m := range b.Milestones {
		if _, err := tx.Exec(`INSERT INTO milestones (job_id, position, title, amount) VALUES (?,?,?,?)`, cid, i+1, m.Title, amounts[i]); err != nil {
			writeErr(w, 500, "could not add the contract")
			return
		}
	}
	logEvent(tx, id, uid, "followup", b.Title)
	logEvent(tx, cid, uid, "followup", b.Title)
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not add the contract")
		return
	}
	s.writeJobDetail(w, 201, cid, uid)
}

// scaleMilestones rewrites a contract's milestone amounts so they add up to the agreed price, keeping the
// proportions. The last milestone absorbs the rounding.
func scaleMilestones(tx *Tx, jobID, price int64) error {
	rows, err := tx.Query(`SELECT id, amount FROM milestones WHERE job_id = ? ORDER BY position`, jobID)
	if err != nil {
		return err
	}
	var ids, amts []int64
	var total int64
	for rows.Next() {
		var id, a int64
		rows.Scan(&id, &a)
		ids, amts, total = append(ids, id), append(amts, a), total+a
	}
	rows.Close()
	if total == 0 || len(ids) == 0 {
		return errors.New("no milestones to scale")
	}
	var used int64
	for i, id := range ids {
		var n int64
		if i == len(ids)-1 {
			n = price - used
		} else {
			n = new(big.Int).Div(new(big.Int).Mul(big.NewInt(amts[i]), big.NewInt(price)), big.NewInt(total)).Int64()
		}
		if n < minMilestone {
			return errors.New("that price is too small to split across the milestones")
		}
		used += n
		if _, err := tx.Exec(`UPDATE milestones SET amount = ? WHERE id = ?`, n, id); err != nil {
			return err
		}
	}
	return nil
}

// ---------- saved jobs ----------

func (s *Server) handleSaveJob(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if _, err := s.db.Exec(`INSERT INTO saved_jobs (user_id, job_id) SELECT ?, id FROM jobs WHERE id = ? AND status <> 'draft' ON CONFLICT DO NOTHING`, uid, id); err != nil {
		writeErr(w, 500, "could not save the job")
		return
	}
	writeJSON(w, 200, map[string]bool{"saved": true})
}

func (s *Server) handleUnsaveJob(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	s.db.Exec(`DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?`, uid, id)
	writeJSON(w, 200, map[string]bool{"saved": false})
}

func (s *Server) handleSavedIDs(w http.ResponseWriter, r *http.Request, uid int64) {
	rows, err := s.db.Query(`SELECT job_id FROM saved_jobs WHERE user_id = ?`, uid)
	out := []int64{}
	if err == nil {
		for rows.Next() {
			var id int64
			rows.Scan(&id)
			out = append(out, id)
		}
		rows.Close()
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleSavedJobs(w http.ResponseWriter, r *http.Request, uid int64) {
	s.writeJobList(w, jobSelect+` WHERE j.id IN (SELECT job_id FROM saved_jobs WHERE user_id = ?) AND j.status <> 'draft' ORDER BY j.created_at DESC`, uid)
}

// ---------- the public job board ----------

// handleListJobs is the public board: open postings that still take applications, with filters, sorting and paging.
// The total number of matches is returned in the X-Total-Count header.
func (s *Server) handleListJobs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := []string{"j.status = 'open'", "j.parent_id IS NULL", "(j.closes_at IS NULL OR j.closes_at > now())"}
	var args []any
	if term := strings.TrimSpace(q.Get("q")); term != "" {
		like := "%" + term + "%"
		where = append(where, "(j.title ILIKE ? OR j.description ILIKE ? OR j.skills::text ILIKE ?)")
		args = append(args, like, like, like)
	}
	for param, col := range map[string]string{"category": "j.category", "level": "j.level", "duration": "j.duration"} {
		if v := q.Get(param); v != "" {
			where = append(where, col+" = ?")
			args = append(args, v)
		}
	}
	if skill := strings.TrimSpace(q.Get("skill")); skill != "" {
		where = append(where, "EXISTS (SELECT 1 FROM jsonb_array_elements_text(j.skills) sk WHERE lower(sk) = lower(?))")
		args = append(args, skill)
	}
	budget := `(SELECT COALESCE(SUM(amount), 0) FROM milestones WHERE job_id = j.id)`
	if v, err := strconv.ParseFloat(q.Get("minBudget"), 64); err == nil && v > 0 {
		where = append(where, budget+" >= ?")
		args = append(args, int64(v*usdcUnit))
	}
	if v, err := strconv.ParseFloat(q.Get("maxBudget"), 64); err == nil && v > 0 {
		where = append(where, budget+" <= ?")
		args = append(args, int64(v*usdcUnit))
	}
	cond := " WHERE " + strings.Join(where, " AND ")

	var total int
	s.db.QueryRow(`SELECT COUNT(*) FROM jobs j`+cond, args...).Scan(&total)

	order := map[string]string{
		"budget_desc": budget + " DESC, j.id DESC",
		"budget_asc":  budget + " ASC, j.id DESC",
		"closing":     "j.closes_at ASC NULLS LAST, j.id DESC",
	}[q.Get("sort")]
	if order == "" {
		order = "j.created_at DESC, j.id DESC"
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit < 1 || limit > 50 {
		limit = 20
	}
	page, _ := strconv.Atoi(q.Get("page"))
	if page < 1 {
		page = 1
	}
	w.Header().Set("X-Total-Count", strconv.Itoa(total))
	s.writeJobList(w, jobSelect+cond+" ORDER BY "+order+fmt.Sprintf(" LIMIT %d OFFSET %d", limit, (page-1)*limit), args...)
}
