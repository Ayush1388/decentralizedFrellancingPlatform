package main

import (
	"database/sql"
	"errors"
	"math/big"
	"net/http"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

// With a contract configured, money state comes from the chain: the client sends the
// transaction from their wallet, then tells the API its hash. The API reads the receipt,
// checks the event matches this exact milestone, and only then mirrors the new state.
// The contract enforces who may act and when, so the API does not re-implement those rules here.

type chainAction struct {
	event string
	to    string
	from  []string
}

var chainActions = map[string]chainAction{
	"fund":    {"MilestoneFunded", "funded", []string{"pending"}},
	"submit":  {"WorkSubmitted", "submitted", []string{"funded"}},
	"approve": {"MilestoneReleased", "released", []string{"submitted"}},
	"claim":   {"MilestoneReleased", "released", []string{"submitted"}},
	"refund":  {"MilestoneRefunded", "refunded", []string{"funded"}},
	"dispute": {"MilestoneDisputed", "disputed", []string{"funded", "submitted"}},
	"resolve": {"MilestoneResolved", "resolved", []string{"disputed"}},
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func (s *Server) chainErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errTxPending):
		writeErr(w, 409, "The transaction is not confirmed yet. Wait a few seconds and try again.")
	case errors.Is(err, errTxReverted):
		writeErr(w, 400, "That transaction reverted on-chain.")
	default:
		writeErr(w, 502, "Could not read the blockchain right now. Try again shortly.")
	}
}

func (s *Server) userWallet(id int64) string {
	var w sql.NullString
	s.db.QueryRow(`SELECT wallet_address FROM users WHERE id = ?`, id).Scan(&w)
	return w.String
}

func (s *Server) isAdminUser(id int64) bool {
	u, err := s.userByID(id)
	return err == nil && u.IsAdmin
}

// handleCreateEscrow records the on-chain escrow a client opened for their job.
func (s *Server) handleCreateEscrow(w http.ResponseWriter, r *http.Request, uid int64) {
	if s.chainInfo == nil {
		writeErr(w, 503, "On-chain escrow is not enabled on this server")
		return
	}
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var b struct {
		TxHash string `json:"txHash"`
	}
	if decodeJSON(r, &b) != nil || !txHashRe.MatchString(b.TxHash) {
		writeErr(w, 400, "txHash must be a 0x-prefixed 32-byte hash")
		return
	}

	var client int64
	var freelancer, escrowID sql.NullInt64
	var status string
	if err := s.db.QueryRow(`SELECT client_id, freelancer_id, status, escrow_id FROM jobs WHERE id = ?`, id).Scan(&client, &freelancer, &status, &escrowID); err != nil {
		writeErr(w, 404, "job not found")
		return
	}
	switch {
	case client != uid:
		writeErr(w, 403, "Only the client can open the escrow")
		return
	case !freelancer.Valid || status != "in_progress":
		writeErr(w, 409, "Hire a freelancer before opening the escrow")
		return
	case escrowID.Valid:
		writeErr(w, 409, "This job already has an escrow")
		return
	}
	clientWallet, freelancerWallet := s.userWallet(client), s.userWallet(freelancer.Int64)
	if clientWallet == "" || freelancerWallet == "" {
		writeErr(w, 409, "Both you and the freelancer need a verified wallet on the Wallet page")
		return
	}

	rows, err := s.db.Query(`SELECT amount FROM milestones WHERE job_id = ? ORDER BY position`, id)
	if err != nil {
		writeErr(w, 500, "could not load milestones")
		return
	}
	var want []int64
	for rows.Next() {
		var a int64
		rows.Scan(&a)
		want = append(want, a)
	}
	rows.Close()

	evs, err := s.chain.Events(r.Context(), b.TxHash)
	if err != nil {
		s.chainErr(w, err)
		return
	}
	for _, ev := range evs {
		if ev.Name != "EscrowCreated" {
			continue
		}
		amounts, _ := ev.Args["amounts"].([]*big.Int)
		eid, ok := ev.uint("escrowId")
		if !ok || ev.address("client") != common.HexToAddress(clientWallet) || ev.address("freelancer") != common.HexToAddress(freelancerWallet) {
			continue
		}
		if len(amounts) != len(want) {
			continue
		}
		match := true
		for i := range want {
			if amounts[i].Cmp(big.NewInt(want[i])) != 0 {
				match = false
			}
		}
		if !match {
			continue
		}
		if _, err := s.db.Exec(`UPDATE jobs SET escrow_id = ? WHERE id = ? AND escrow_id IS NULL`, int64(eid), id); err != nil {
			if isUnique(err) {
				writeErr(w, 409, "That escrow is already attached to another job")
				return
			}
			writeErr(w, 500, "could not save escrow")
			return
		}
		s.writeJobDetail(w, 200, id, uid)
		return
	}
	writeErr(w, 400, "That transaction did not open an escrow matching this job's wallets and milestones")
}

// handleChainMilestone mirrors a milestone transition after verifying its transaction.
func (s *Server) handleChainMilestone(w http.ResponseWriter, r *http.Request, uid, id int64, action, txHash, deliverableURL string) {
	spec, ok := chainActions[action]
	if !ok {
		writeErr(w, 404, "unknown action")
		return
	}
	if !txHashRe.MatchString(txHash) {
		writeErr(w, 400, "txHash is required: send the transaction from your wallet first")
		return
	}

	var (
		jobID, client int64
		position      int
		status        string
		escrowID      sql.NullInt64
		freelancer    sql.NullInt64
	)
	err := s.db.QueryRow(`SELECT m.job_id, m.position, m.status, j.escrow_id, j.client_id, j.freelancer_id
		FROM milestones m JOIN jobs j ON j.id = m.job_id WHERE m.id = ?`, id).Scan(&jobID, &position, &status, &escrowID, &client, &freelancer)
	if err != nil {
		writeErr(w, 404, "milestone not found")
		return
	}
	if uid != client && !(freelancer.Valid && uid == freelancer.Int64) && !s.isAdminUser(uid) {
		writeErr(w, 403, "Only people on this job can update it")
		return
	}
	if !escrowID.Valid {
		writeErr(w, 409, "Open the on-chain escrow for this job first")
		return
	}
	if status == spec.to { // already mirrored; makes retries and double-clicks harmless
		s.writeJobDetail(w, 200, jobID, uid)
		return
	}
	if !contains(spec.from, status) {
		writeErr(w, 409, "This milestone is "+status+", so it cannot be "+action+"ed")
		return
	}

	evs, err := s.chain.Events(r.Context(), txHash)
	if err != nil {
		s.chainErr(w, err)
		return
	}
	var ev *ChainEvent
	for i := range evs {
		e := evs[i]
		eid, ok1 := e.uint("escrowId")
		idx, ok2 := e.uint("index")
		if e.Name == spec.event && ok1 && ok2 && int64(eid) == escrowID.Int64 && int(idx) == position-1 {
			ev = &evs[i]
			break
		}
	}
	if ev == nil {
		writeErr(w, 400, "That transaction does not match this milestone")
		return
	}

	deliverableURL = strings.TrimSpace(deliverableURL)
	if action == "submit" {
		got, _ := ev.bytes32("deliverable")
		if !deliverableRe.MatchString(deliverableURL) || len(deliverableURL) > 500 || crypto.Keccak256Hash([]byte(deliverableURL)) != common.Hash(got) {
			writeErr(w, 400, "The link does not match the hash you submitted on-chain")
			return
		}
	}

	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, 500, "could not update milestone")
		return
	}
	defer tx.Rollback()
	var cur string
	if err := tx.QueryRow(`SELECT status FROM milestones WHERE id = ? FOR UPDATE`, id).Scan(&cur); err != nil || !contains(spec.from, cur) {
		writeErr(w, 409, "This milestone changed while we were checking. Refresh and retry.")
		return
	}

	at := ev.BlockTime
	switch spec.to {
	case "funded":
		_, err = tx.Exec(`UPDATE milestones SET status='funded', funded_at=?, fund_tx=? WHERE id=?`, at, txHash, id)
	case "submitted":
		_, err = tx.Exec(`UPDATE milestones SET status='submitted', submitted_at=?, deliverable_url=? WHERE id=?`, at, deliverableURL, id)
	case "disputed":
		_, err = tx.Exec(`UPDATE milestones SET status='disputed' WHERE id=?`, id)
	case "released":
		_, err = tx.Exec(`UPDATE milestones SET status='released', resolved_at=?, freelancer_bps=10000, release_tx=? WHERE id=?`, at, txHash, id)
	case "refunded":
		_, err = tx.Exec(`UPDATE milestones SET status='refunded', resolved_at=?, freelancer_bps=0, release_tx=? WHERE id=?`, at, txHash, id)
	case "resolved":
		bps, _ := ev.bps("freelancerBps")
		_, err = tx.Exec(`UPDATE milestones SET status='resolved', resolved_at=?, freelancer_bps=?, release_tx=? WHERE id=?`, at, bps, txHash, id)
	}
	if err != nil {
		writeErr(w, 500, "could not update milestone")
		return
	}
	closeJobIfDone(tx, jobID, freelancer)
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "could not update milestone")
		return
	}
	s.writeJobDetail(w, 200, jobID, uid)
}

// closeJobIfDone completes the job once every milestone has been paid out or refunded.
func closeJobIfDone(tx *Tx, jobID int64, freelancer sql.NullInt64) {
	var open int
	tx.QueryRow(`SELECT COUNT(*) FROM milestones WHERE job_id = ? AND status NOT IN ('released','resolved','refunded')`, jobID).Scan(&open)
	if open != 0 {
		return
	}
	res, _ := tx.Exec(`UPDATE jobs SET status='completed' WHERE id = ? AND status <> 'completed'`, jobID)
	if n, _ := res.RowsAffected(); n > 0 && freelancer.Valid {
		tx.Exec(`UPDATE developers SET jobs_done = jobs_done + 1 WHERE user_id = ?`, freelancer.Int64)
	}
}
