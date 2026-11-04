package main

import (
	"context"
	"database/sql"
	"fmt"
	"math/big"
	"net/http"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

// A wallet transaction and the website's record of it are two separate steps. If the tab closes, or the API is
// down, between them, the chain says "paid" while the site still says "in escrow". The contract keeps the full
// state of every milestone, so the site can always catch up by reading it back: that is what sync does.

// ChainMilestone is the contract's own record of one milestone.
type ChainMilestone struct {
	Status        int // 0 pending, 1 funded, 2 submitted, 3 released, 4 refunded, 5 disputed, 6 resolved
	Revisions     int
	FreelancerBps int
	FundedAt      time.Time
	SubmittedAt   time.Time
	DisputedAt    time.Time
	Deliverable   [32]byte
}

var chainStatus = []string{"pending", "funded", "submitted", "released", "refunded", "disputed", "resolved"}

type rawMilestone struct {
	Amount        *big.Int
	Status        uint8
	Revisions     uint8
	FreelancerBps uint16
	FundedAt      uint64
	SubmittedAt   uint64
	DisputedAt    uint64
	Deliverable   [32]byte
}

func (c *Chain) Milestone(ctx context.Context, escrowID int64, index int) (ChainMilestone, error) {
	data, err := c.abi.Pack("getMilestone", big.NewInt(escrowID), big.NewInt(int64(index)))
	if err != nil {
		return ChainMilestone{}, err
	}
	out, err := c.rpc.CallContract(ctx, ethereum.CallMsg{To: &c.contract, Data: data}, nil)
	if err != nil {
		return ChainMilestone{}, err
	}
	res, err := c.abi.Unpack("getMilestone", out)
	if err != nil || len(res) == 0 {
		return ChainMilestone{}, fmt.Errorf("unexpected getMilestone result: %v", err)
	}
	raw := abi.ConvertType(res[0], new(rawMilestone)).(*rawMilestone)
	at := func(u uint64) time.Time {
		if u == 0 {
			return time.Time{}
		}
		return time.Unix(int64(u), 0).UTC()
	}
	return ChainMilestone{
		Status: int(raw.Status), Revisions: int(raw.Revisions), FreelancerBps: int(raw.FreelancerBps),
		FundedAt: at(raw.FundedAt), SubmittedAt: at(raw.SubmittedAt), DisputedAt: at(raw.DisputedAt), Deliverable: raw.Deliverable,
	}, nil
}

// handleSync makes the website match the blockchain for one job. Safe to run any time and as often as needed.
// If the freelancer's delivery was recorded on-chain but not on the site, the link itself only exists off-chain
// (the contract stores its hash), so the request may carry it: {"deliverables": {"<milestoneId>": "https://..."}}.
func (s *Server) handleSync(w http.ResponseWriter, r *http.Request, uid int64) {
	if s.chain == nil {
		writeErr(w, 409, "This server is not connected to a blockchain, so there is nothing to sync")
		return
	}
	jobID, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var b struct {
		Deliverables map[string]string `json:"deliverables"`
	}
	if r.ContentLength != 0 && decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	var escrow, freelancer sql.NullInt64
	var client int64
	if s.db.QueryRow(`SELECT escrow_id, client_id, freelancer_id FROM jobs WHERE id = ?`, jobID).Scan(&escrow, &client, &freelancer) != nil {
		writeErr(w, 404, "job not found")
		return
	}
	if uid != client && !(freelancer.Valid && uid == freelancer.Int64) && !s.isAdminUser(uid) {
		writeErr(w, 403, "Only people on this job can sync it")
		return
	}
	if !escrow.Valid {
		writeErr(w, 409, "This job has no on-chain escrow yet")
		return
	}

	type row struct {
		id             int64
		position       int
		status, urlStr string
		revisions      int
	}
	var ms []row
	rows, err := s.db.Query(`SELECT id, position, status, COALESCE(deliverable_url, ''), revisions FROM milestones WHERE job_id = ? ORDER BY position`, jobID)
	if err != nil {
		writeErr(w, 500, "could not load milestones")
		return
	}
	for rows.Next() {
		var m row
		rows.Scan(&m.id, &m.position, &m.status, &m.urlStr, &m.revisions)
		ms = append(ms, m)
	}
	rows.Close()

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not sync")
		return
	}
	defer tx.Rollback()
	changes := 0
	for _, m := range ms {
		cm, err := s.chain.Milestone(ctx, escrow.Int64, m.position-1)
		if err != nil {
			writeErr(w, 502, "Could not read the blockchain right now. Try again shortly.")
			return
		}
		if cm.Status < 0 || cm.Status >= len(chainStatus) {
			continue
		}
		want := chainStatus[cm.Status]
		hashMatches := func(url string) bool {
			return url != "" && crypto.Keccak256Hash([]byte(url)) == common.Hash(cm.Deliverable)
		}
		url := m.urlStr
		if cm.Status == 2 && !hashMatches(url) { // delivered on-chain: accept the link only if it hashes to the on-chain value
			if given := b.Deliverables[fmt.Sprint(m.id)]; hashMatches(given) {
				url = given
			} else {
				url = ""
			}
		}
		if want == m.status && cm.Revisions == m.revisions && (cm.Status != 2 || url == m.urlStr) {
			continue
		}
		var execErr error
		switch want {
		case "pending":
			_, execErr = tx.Exec(`UPDATE milestones SET status='pending', revisions=? WHERE id=?`, cm.Revisions, m.id)
		case "funded":
			_, execErr = tx.Exec(`UPDATE milestones SET status='funded', funded_at=?, submitted_at=NULL, revisions=? WHERE id=?`, orNow(cm.FundedAt), cm.Revisions, m.id)
		case "submitted":
			_, execErr = tx.Exec(`UPDATE milestones SET status='submitted', funded_at=COALESCE(funded_at, ?), submitted_at=?, deliverable_url=NULLIF(?, ''), revisions=? WHERE id=?`,
				orNow(cm.FundedAt), orNow(cm.SubmittedAt), url, cm.Revisions, m.id)
		case "released", "refunded", "resolved":
			_, execErr = tx.Exec(`UPDATE milestones SET status=?, freelancer_bps=?, resolved_at=COALESCE(resolved_at, now()), revisions=? WHERE id=?`, want, cm.FreelancerBps, cm.Revisions, m.id)
		case "disputed":
			_, execErr = tx.Exec(`UPDATE milestones SET status='disputed', disputed_at=?, revisions=? WHERE id=?`, orNow(cm.DisputedAt), cm.Revisions, m.id)
		}
		if execErr != nil {
			writeErr(w, 500, "could not sync")
			return
		}
		changes++
	}
	if changes > 0 {
		logEvent(tx, jobID, uid, "synced", fmt.Sprintf("%d milestone(s) brought in line with the blockchain", changes))
		closeJobIfDone(tx, jobID, freelancer)
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not sync")
		return
	}
	s.writeJobDetail(w, 200, jobID, uid)
}

func orNow(t time.Time) time.Time {
	if t.IsZero() {
		return now()
	}
	return t
}
