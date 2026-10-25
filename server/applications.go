package main

import (
	"database/sql"
	"errors"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// DevBrief is the slice of a developer profile a client needs while comparing applicants.
type DevBrief struct {
	ID         int64    `json:"id"`
	Title      string   `json:"title"`
	HourlyRate int      `json:"hourlyRate"`
	Rating     float64  `json:"rating"`
	JobsDone   int      `json:"jobsDone"`
	Skills     []string `json:"skills"`
}

type Application struct {
	ID           int64     `json:"id"`
	JobID        int64     `json:"jobId,omitempty"`
	User         Party     `json:"user"`
	Cover        string    `json:"cover"`
	Status       string    `json:"status"` // pending, shortlisted, declined, accepted
	CreatedAt    string    `json:"createdAt"`
	GithubURL    string    `json:"githubUrl"`
	PortfolioURL string    `json:"portfolioUrl"`
	Bid          *int64    `json:"bid"` // proposed total price, USDC base units
	EtaDays      *int      `json:"etaDays"`
	Resume       *string   `json:"resume"` // URL of the PDF, only readable by the applicant and the client
	ResumeName   string    `json:"resumeName"`
	Developer    *DevBrief `json:"developer"`
	HasWallet    bool      `json:"hasWallet"`
	Messages     int       `json:"messages"`
	ContractID   *int64    `json:"contractId"` // the job they work on once hired
}

const appSelect = `
SELECT a.id, a.job_id, a.user_id, u.name, a.cover, a.status, a.created_at, a.github_url, a.portfolio_url, a.bid, a.eta_days,
       a.resume_file_id, COALESCE(f.name, ''), u.wallet_address IS NOT NULL,
       d.id, d.title, d.hourly_rate, d.rating, d.jobs_done, d.skills::text,
       (SELECT COUNT(*) FROM messages WHERE application_id = a.id),
       CASE WHEN a.status = 'accepted' THEN COALESCE(
         (SELECT c.id FROM jobs c WHERE c.parent_id = a.job_id AND c.freelancer_id = a.user_id ORDER BY c.id DESC LIMIT 1), a.job_id) END
FROM applications a
JOIN users u ON u.id = a.user_id
LEFT JOIN files f ON f.id = a.resume_file_id
LEFT JOIN developers d ON d.user_id = a.user_id
WHERE `

func (s *Server) loadApplications(where string, args ...any) ([]Application, error) {
	rows, err := s.db.Query(appSelect+where, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Application
	for rows.Next() {
		var a Application
		var resume, devID sql.NullInt64
		var devTitle, devSkills sql.NullString
		var devRate, devJobs sql.NullInt64
		var devRating sql.NullFloat64
		if err := rows.Scan(&a.ID, &a.JobID, &a.User.ID, &a.User.Name, &a.Cover, &a.Status, &a.CreatedAt, &a.GithubURL, &a.PortfolioURL, &a.Bid, &a.EtaDays,
			&resume, &a.ResumeName, &a.HasWallet, &devID, &devTitle, &devRate, &devRating, &devJobs, &devSkills, &a.Messages, &a.ContractID); err != nil {
			return nil, err
		}
		if resume.Valid {
			u := fileURL(resume.Int64)
			a.Resume = &u
		}
		if devID.Valid {
			a.Developer = &DevBrief{ID: devID.Int64, Title: devTitle.String, HourlyRate: int(devRate.Int64), Rating: devRating.Float64, JobsDone: int(devJobs.Int64), Skills: parseSkills(devSkills.String)}
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// optionalURL accepts an empty string or an http(s) link, optionally restricted to one host.
func optionalURL(raw, host string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", true
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || len(raw) > 300 {
		return "", false
	}
	if host != "" && strings.TrimPrefix(strings.ToLower(u.Host), "www.") != host {
		return "", false
	}
	return raw, true
}

func (s *Server) handleApply(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	// The form arrives as multipart when a resume is attached, JSON otherwise.
	var in struct {
		Cover        string  `json:"cover"`
		GithubURL    string  `json:"githubUrl"`
		PortfolioURL string  `json:"portfolioUrl"`
		Bid          float64 `json:"bid"` // USDC
		EtaDays      int     `json:"etaDays"`
	}
	multipart := strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data")
	if multipart {
		r.Body = http.MaxBytesReader(w, r.Body, maxResume+(1<<20))
		if err := r.ParseMultipartForm(maxResume + (1 << 20)); err != nil {
			writeErr(w, 400, "The form is too large. Resumes must be under 5 MB.")
			return
		}
		in.Cover, in.GithubURL, in.PortfolioURL = r.FormValue("cover"), r.FormValue("githubUrl"), r.FormValue("portfolioUrl")
		in.Bid, _ = strconv.ParseFloat(r.FormValue("bid"), 64)
		in.EtaDays, _ = strconv.Atoi(r.FormValue("etaDays"))
	} else if decodeJSON(r, &in) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}

	in.Cover = strings.TrimSpace(in.Cover)
	github, okG := optionalURL(in.GithubURL, "github.com")
	portfolio, okP := optionalURL(in.PortfolioURL, "")
	switch {
	case len(in.Cover) < 20 || len(in.Cover) > 2000:
		writeErr(w, 400, "Write a cover note of 20 to 2000 characters")
		return
	case !okG:
		writeErr(w, 400, "The GitHub link must be a github.com address")
		return
	case !okP:
		writeErr(w, 400, "The portfolio link must start with https://")
		return
	case math.IsNaN(in.Bid) || in.Bid < 0 || in.Bid > 1_000_000:
		writeErr(w, 400, "Your quote must be between 1 and 1,000,000 USDC")
		return
	case in.EtaDays < 0 || in.EtaDays > 365:
		writeErr(w, 400, "Estimated delivery must be between 1 and 365 days")
		return
	}

	var client int64
	var status string
	var closesAt *string
	if err := s.db.QueryRow(`SELECT client_id, status, closes_at FROM jobs WHERE id = ?`, id).Scan(&client, &status, &closesAt); err != nil {
		writeErr(w, 404, "job not found")
		return
	}
	switch {
	case client == uid:
		writeErr(w, 403, "You cannot apply to your own job")
		return
	case !acceptingApplications(status, closesAt):
		writeErr(w, 409, "This job is no longer taking applications")
		return
	}

	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not submit application")
		return
	}
	defer tx.Rollback()
	var resume any
	if multipart {
		f, hdr, err := r.FormFile("resume")
		if err == nil {
			fid, err := storeUpload(tx, uid, "resume", f, hdr)
			if err != nil {
				writeErr(w, 400, err.Error())
				return
			}
			resume = fid
		} else if !errors.Is(err, http.ErrMissingFile) {
			writeErr(w, 400, "could not read the resume")
			return
		}
	}
	if resume == nil && github == "" && portfolio == "" {
		writeErr(w, 400, "Attach a resume or add a GitHub or portfolio link so the client can see your work")
		return
	}
	var bid, eta any
	if in.Bid >= 1 {
		bid = int64(math.Round(in.Bid * usdcUnit))
	}
	if in.EtaDays > 0 {
		eta = in.EtaDays
	}
	if _, err := tx.Exec(`INSERT INTO applications (job_id, user_id, cover, github_url, portfolio_url, bid, eta_days, resume_file_id) VALUES (?,?,?,?,?,?,?,?)`,
		id, uid, in.Cover, github, portfolio, bid, eta, resume); err != nil {
		if isUnique(err) {
			writeErr(w, 409, "You already applied to this job")
			return
		}
		writeErr(w, 500, "could not submit application")
		return
	}
	var name string
	tx.QueryRow(`SELECT name FROM users WHERE id = ?`, uid).Scan(&name)
	logEvent(tx, id, uid, "applied", name)
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not submit application")
		return
	}
	s.writeJobDetail(w, 201, id, uid)
}

// applicationAccess loads who is on either side of an application.
func (s *Server) applicationAccess(appID int64) (jobID, applicant, client int64, status, jobStatus string, err error) {
	err = s.db.QueryRow(`SELECT a.job_id, a.user_id, j.client_id, a.status, j.status FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?`, appID).
		Scan(&jobID, &applicant, &client, &status, &jobStatus)
	return
}

// handleApplicationStatus lets the client shortlist, decline, or move an applicant back to pending.
func (s *Server) handleApplicationStatus(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var b struct {
		Status string `json:"status"`
	}
	if decodeJSON(r, &b) != nil || (b.Status != "pending" && b.Status != "shortlisted" && b.Status != "declined") {
		writeErr(w, 400, "status must be pending, shortlisted or declined")
		return
	}
	jobID, _, client, status, jobStatus, err := s.applicationAccess(id)
	switch {
	case err != nil:
		writeErr(w, 404, "application not found")
		return
	case client != uid:
		writeErr(w, 403, "Only the client can review applications")
		return
	case status == "accepted":
		writeErr(w, 409, "This applicant is already hired")
		return
	case jobStatus != "open":
		writeErr(w, 409, "This job is no longer hiring")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not update application")
		return
	}
	defer tx.Rollback()
	tx.Exec(`UPDATE applications SET status = ? WHERE id = ?`, b.Status, id)
	if b.Status != "pending" {
		var name string
		tx.QueryRow(`SELECT u.name FROM applications a JOIN users u ON u.id = a.user_id WHERE a.id = ?`, id).Scan(&name)
		logEvent(tx, jobID, uid, b.Status, name)
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not update application")
		return
	}
	s.writeJobDetail(w, 200, jobID, uid)
}

// handleWithdrawApplication removes the caller's own application while the client is still deciding.
func (s *Server) handleWithdrawApplication(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	jobID, applicant, _, status, _, err := s.applicationAccess(id)
	switch {
	case err != nil:
		writeErr(w, 404, "application not found")
		return
	case applicant != uid:
		writeErr(w, 403, "You can only withdraw your own application")
		return
	case status != "pending" && status != "shortlisted":
		writeErr(w, 409, "This application is "+status+", so it can no longer be withdrawn")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not withdraw")
		return
	}
	defer tx.Rollback()
	var resume sql.NullInt64
	tx.QueryRow(`SELECT resume_file_id FROM applications WHERE id = ?`, id).Scan(&resume)
	tx.Exec(`DELETE FROM applications WHERE id = ?`, id)
	if resume.Valid {
		tx.Exec(`DELETE FROM files WHERE id = ?`, resume.Int64)
	}
	logEvent(tx, jobID, uid, "withdrew", "")
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not withdraw")
		return
	}
	s.writeJobDetail(w, 200, jobID, uid)
}

// Pre-hire thread between the client and one applicant.
func (s *Server) appThreadAccess(w http.ResponseWriter, r *http.Request, uid int64) (appID, jobID int64, ok bool) {
	appID, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return 0, 0, false
	}
	jobID, applicant, client, _, _, err := s.applicationAccess(appID)
	if err != nil {
		writeErr(w, 404, "application not found")
		return 0, 0, false
	}
	if uid != applicant && uid != client {
		writeErr(w, 403, "Only the client and this applicant can read this conversation")
		return 0, 0, false
	}
	return appID, jobID, true
}

func (s *Server) handleListAppMessages(w http.ResponseWriter, r *http.Request, uid int64) {
	if appID, _, ok := s.appThreadAccess(w, r, uid); ok {
		s.writeMessages(w, `m.application_id = ?`, appID)
	}
}

func (s *Server) handlePostAppMessage(w http.ResponseWriter, r *http.Request, uid int64) {
	if appID, jobID, ok := s.appThreadAccess(w, r, uid); ok {
		s.postMessage(w, r, uid, jobID, appID)
	}
}

// handleReview lets the client rate the freelancer once a contract is complete.
func (s *Server) handleReview(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var b struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if decodeJSON(r, &b) != nil || b.Rating < 1 || b.Rating > 5 {
		writeErr(w, 400, "Rating must be 1 to 5 stars")
		return
	}
	b.Comment = strings.TrimSpace(b.Comment)
	if len(b.Comment) > 1000 {
		writeErr(w, 400, "Keep the review under 1000 characters")
		return
	}
	var client int64
	var freelancer sql.NullInt64
	var status string
	if err := s.db.QueryRow(`SELECT client_id, freelancer_id, status FROM jobs WHERE id = ?`, id).Scan(&client, &freelancer, &status); err != nil {
		writeErr(w, 404, "job not found")
		return
	}
	switch {
	case client != uid:
		writeErr(w, 403, "Only the client can review this work")
		return
	case status != "completed" || !freelancer.Valid:
		writeErr(w, 409, "You can leave a review once the job is completed")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not save review")
		return
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO reviews (job_id, reviewer_id, freelancer_id, rating, comment) VALUES (?,?,?,?,?)`, id, uid, freelancer.Int64, b.Rating, b.Comment); err != nil {
		if isUnique(err) {
			writeErr(w, 409, "You already reviewed this job")
			return
		}
		writeErr(w, 500, "could not save review")
		return
	}
	// The profile rating is the average of every review the freelancer has received.
	tx.Exec(`UPDATE developers SET rating = (SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE freelancer_id = ?) WHERE user_id = ?`, freelancer.Int64, freelancer.Int64)
	logEvent(tx, id, uid, "reviewed", strconv.Itoa(b.Rating)+" stars")
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not save review")
		return
	}
	s.writeJobDetail(w, 200, id, uid)
}

type DisputeItem struct {
	MilestoneID int64  `json:"milestoneId"`
	JobID       int64  `json:"jobId"`
	JobTitle    string `json:"jobTitle"`
	Title       string `json:"title"`
	Amount      int64  `json:"amount"`
	Reason      string `json:"reason"`
}

// handleAdminDisputes is the arbiter's queue.
func (s *Server) handleAdminDisputes(w http.ResponseWriter, r *http.Request, uid int64) {
	if !s.isAdminUser(uid) {
		writeErr(w, 403, "Only the platform arbiter can see disputes")
		return
	}
	rows, err := s.db.Query(`SELECT m.id, j.id, j.title, m.title, m.amount, m.dispute_reason FROM milestones m JOIN jobs j ON j.id = m.job_id
		WHERE m.status = 'disputed' ORDER BY m.id`)
	if err != nil {
		writeErr(w, 500, "could not load disputes")
		return
	}
	defer rows.Close()
	out := []DisputeItem{}
	for rows.Next() {
		var d DisputeItem
		rows.Scan(&d.MilestoneID, &d.JobID, &d.JobTitle, &d.Title, &d.Amount, &d.Reason)
		out = append(out, d)
	}
	writeJSON(w, 200, out)
}
