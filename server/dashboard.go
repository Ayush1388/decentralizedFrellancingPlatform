package main

import (
	"fmt"
	"net/http"
	"strings"
)

type DashJob struct {
	ID          int64  `json:"id"`
	Title       string `json:"title"`
	Status      string `json:"status"`
	Role        string `json:"role"` // client, freelancer or applicant
	CreatedAt   string `json:"createdAt"`
	Total       int64  `json:"total"`
	Paid        int64  `json:"paid"`
	InEscrow    int64  `json:"inEscrow"`
	Applicants  int    `json:"applicants"`
	Demo        bool   `json:"demo"`
	Counterpart *Party `json:"counterpart"`
	AppStatus   string `json:"applicationStatus"`
	ParentID    *int64 `json:"parentId"`
	Unread      int    `json:"unread"`
	ToReview    int    `json:"toReview"`
}

type DashAction struct {
	Key      string `json:"key"`
	JobID    int64  `json:"jobId"`
	JobTitle string `json:"jobTitle"`
	Title    string `json:"title"`
	Amount   *int64 `json:"amount"`
	Step     string `json:"step"`
}

type sumBucket struct {
	Amount int64 `json:"amount"`
	Count  int   `json:"count"`
}

// handleDashboard summarises everything the signed-in person is involved in with three queries,
// instead of the page asking for every job one by one.
func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request, uid int64) {
	unread := s.unreadFor(uid)
	out := struct {
		Jobs    []DashJob            `json:"jobs"`
		Sums    map[string]sumBucket `json:"sums"`
		Actions []DashAction         `json:"actions"`
		Unread  unreadSummary        `json:"unread"`
	}{Jobs: []DashJob{}, Actions: []DashAction{}, Unread: unread, Sums: map[string]sumBucket{"pending": {}, "escrow": {}, "paid": {}, "refunded": {}}}

	rows, err := s.db.Query(`SELECT j.id, j.title, j.status, j.created_at, j.client_id, COALESCE(j.freelancer_id, 0), cu.name, COALESCE(fu.name, ''), j.parent_id, cu.is_demo,
			CASE WHEN j.client_id = ? THEN 'client' WHEN j.freelancer_id = ? THEN 'freelancer' ELSE 'applicant' END,
			(SELECT COUNT(*) FROM applications WHERE job_id = j.id),
			COALESCE((SELECT status FROM applications WHERE job_id = j.id AND user_id = ?), ''),
			(SELECT COUNT(*) FROM applications WHERE job_id = j.id AND status IN ('pending','shortlisted'))
		FROM jobs j JOIN users cu ON cu.id = j.client_id LEFT JOIN users fu ON fu.id = j.freelancer_id
		WHERE j.client_id = ? OR j.freelancer_id = ? OR j.id IN (SELECT job_id FROM applications WHERE user_id = ?)
		ORDER BY j.created_at DESC LIMIT 60`, uid, uid, uid, uid, uid, uid)
	if err != nil {
		writeErr(w, 500, "could not load the dashboard")
		return
	}
	type meta struct{ client, freelancer int64 }
	metas := map[int64]meta{}
	var ids []string
	for rows.Next() {
		var j DashJob
		var client, freelancer int64
		var cname, fname string
		if err := rows.Scan(&j.ID, &j.Title, &j.Status, &j.CreatedAt, &client, &freelancer, &cname, &fname, &j.ParentID, &j.Demo, &j.Role, &j.Applicants, &j.AppStatus, &j.ToReview); err != nil {
			continue
		}
		if j.Role == "client" && freelancer != 0 {
			j.Counterpart = &Party{ID: freelancer, Name: fname}
		} else if j.Role != "client" {
			j.Counterpart = &Party{ID: client, Name: cname}
		}
		if j.Role != "client" || j.Status != "open" {
			j.ToReview = 0
		}
		j.Unread = unread.Jobs[j.ID]
		metas[j.ID] = meta{client, freelancer}
		out.Jobs = append(out.Jobs, j)
		ids = append(ids, fmt.Sprint(j.ID))
	}
	rows.Close()
	if len(ids) == 0 {
		writeJSON(w, 200, out)
		return
	}

	byJob := map[int]int{}
	for i, j := range out.Jobs {
		byJob[int(j.ID)] = i
	}
	mrows, err := s.db.Query(`SELECT job_id, id, title, amount, status, feedback FROM milestones WHERE job_id = ANY(?::bigint[]) ORDER BY job_id, position`, "{"+strings.Join(ids, ",")+"}")
	if err == nil {
		for mrows.Next() {
			var jobID, id, amount int64
			var title, status, feedback string
			if mrows.Scan(&jobID, &id, &title, &amount, &status, &feedback) != nil {
				continue
			}
			j := &out.Jobs[byJob[int(jobID)]]
			// A posting's milestones are a template until someone is hired; applicants see none of the money.
			if j.Role == "applicant" || metas[jobID].freelancer == 0 {
				continue
			}
			bucket := map[string]string{"pending": "pending", "funded": "escrow", "submitted": "escrow", "disputed": "escrow", "released": "paid", "resolved": "paid", "refunded": "refunded"}[status]
			b := out.Sums[bucket]
			b.Amount, b.Count = b.Amount+amount, b.Count+1
			out.Sums[bucket] = b
			j.Total += amount
			switch status {
			case "funded", "submitted", "disputed":
				j.InEscrow += amount
			case "released", "resolved":
				j.Paid += amount
			}
			step := ""
			switch {
			case j.Role == "client" && status == "pending" && j.Status == "in_progress":
				step = "Fund"
			case j.Role == "client" && status == "submitted":
				step = "Review"
			case j.Role == "freelancer" && status == "funded" && feedback != "":
				step = "Rework"
			case j.Role == "freelancer" && status == "funded":
				step = "Deliver"
			case status == "disputed":
				step = "Disputed"
			}
			if step != "" {
				amt := amount
				out.Actions = append(out.Actions, DashAction{Key: fmt.Sprintf("m%d", id), JobID: jobID, JobTitle: j.Title, Title: title, Amount: &amt, Step: step})
			}
		}
		mrows.Close()
	}
	// Totals for postings and applications come from the milestone template or nothing at all.
	for i := range out.Jobs {
		j := &out.Jobs[i]
		if j.Total == 0 && (j.Role == "client" || j.Role == "applicant") {
			s.db.QueryRow(`SELECT COALESCE(SUM(amount), 0) FROM milestones WHERE job_id = ?`, j.ID).Scan(&j.Total)
		}
		if j.Role == "client" && j.ToReview > 0 && j.Status == "open" {
			out.Actions = append([]DashAction{{Key: fmt.Sprintf("a%d", j.ID), JobID: j.ID, JobTitle: j.Title, Title: fmt.Sprintf("%d applicant%s to review", j.ToReview, map[bool]string{true: "", false: "s"}[j.ToReview == 1]), Step: "Hire"}}, out.Actions...)
		}
		if j.Role == "applicant" && j.AppStatus == "shortlisted" {
			out.Actions = append([]DashAction{{Key: fmt.Sprintf("s%d", j.ID), JobID: j.ID, JobTitle: j.Title, Title: "You are shortlisted", Step: "Reply"}}, out.Actions...)
		}
		if j.Role == "client" && j.Status == "draft" {
			out.Actions = append(out.Actions, DashAction{Key: fmt.Sprintf("d%d", j.ID), JobID: j.ID, JobTitle: j.Title, Title: "Finish and publish your draft", Step: "Publish"})
		}
	}
	writeJSON(w, 200, out)
}
