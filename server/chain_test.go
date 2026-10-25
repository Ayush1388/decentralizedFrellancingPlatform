package main

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

var (
	clientAddr     = common.HexToAddress("0x1111111111111111111111111111111111111111")
	freelancerAddr = common.HexToAddress("0x2222222222222222222222222222222222222222")
	escrowAddr     = common.HexToAddress("0x3333333333333333333333333333333333333333")
)

func loadABI(t *testing.T) abi.ABI {
	t.Helper()
	a, err := abi.JSON(strings.NewReader(string(escrowABIJSON)))
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func word(n int64) common.Hash { return common.BigToHash(big.NewInt(n)) }

// ---- decoding real ABI-encoded logs ----

func TestParseLogsDecodesEscrowEvents(t *testing.T) {
	a := loadABI(t)
	created := a.Events["EscrowCreated"]
	data, err := created.Inputs.NonIndexed().Pack([]*big.Int{big.NewInt(400_000_000), big.NewInt(900_000_000)})
	if err != nil {
		t.Fatal(err)
	}
	submitted := a.Events["WorkSubmitted"]
	hash := crypto.Keccak256Hash([]byte("https://example.com/work"))
	subData, _ := submitted.Inputs.NonIndexed().Pack([32]byte(hash))

	logs := []*types.Log{
		{Address: escrowAddr, Topics: []common.Hash{created.ID, word(7), common.BytesToHash(clientAddr.Bytes()), common.BytesToHash(freelancerAddr.Bytes())}, Data: data},
		{Address: escrowAddr, Topics: []common.Hash{submitted.ID, word(7), word(1)}, Data: subData},
		// a log from some other contract must be ignored
		{Address: common.HexToAddress("0x9999999999999999999999999999999999999999"), Topics: []common.Hash{created.ID, word(1), word(1), word(1)}, Data: data},
		// an unknown event from our contract must be ignored too
		{Address: escrowAddr, Topics: []common.Hash{crypto.Keccak256Hash([]byte("Nope()"))}},
	}
	evs, err := parseLogs(a, escrowAddr, logs)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 2 {
		t.Fatalf("decoded %d events, want 2", len(evs))
	}

	c := evs[0]
	if id, _ := c.uint("escrowId"); c.Name != "EscrowCreated" || id != 7 {
		t.Fatalf("bad EscrowCreated: %+v", c)
	}
	if c.address("client") != clientAddr || c.address("freelancer") != freelancerAddr {
		t.Fatalf("wrong parties: %v %v", c.address("client"), c.address("freelancer"))
	}
	amounts := c.Args["amounts"].([]*big.Int)
	if len(amounts) != 2 || amounts[1].Int64() != 900_000_000 {
		t.Fatalf("amounts = %v", amounts)
	}

	s := evs[1]
	idx, _ := s.uint("index")
	got, _ := s.bytes32("deliverable")
	if s.Name != "WorkSubmitted" || idx != 1 || common.Hash(got) != hash {
		t.Fatalf("bad WorkSubmitted: %+v", s)
	}
}

// ---- the API's on-chain mode, with a fake node ----

type fakeChain struct {
	txs map[string][]ChainEvent
	err map[string]error
}

func (f *fakeChain) Events(_ context.Context, tx string) ([]ChainEvent, error) {
	if e := f.err[tx]; e != nil {
		return nil, e
	}
	evs, ok := f.txs[tx]
	if !ok {
		return nil, errTxPending
	}
	return evs, nil
}

var txCounter int64

func (f *fakeChain) add(evs ...ChainEvent) string {
	txCounter++
	h := fmt.Sprintf("0x%064x", txCounter)
	for i := range evs {
		evs[i].BlockTime = time.Now().UTC()
	}
	f.txs[h] = evs
	return h
}

func ev(name string, args map[string]any) ChainEvent { return ChainEvent{Name: name, Args: args} }

func msEv(name string, escrow, index int64, extra map[string]any) ChainEvent {
	args := map[string]any{"escrowId": big.NewInt(escrow), "index": big.NewInt(index)}
	for k, v := range extra {
		args[k] = v
	}
	return ev(name, args)
}

type chainEnv struct {
	*env_
	fake                  *fakeChain
	client, dev, stranger string
	clientID, devID       int64
	jobID                 int
	milestones            []int
}

func newChainEnv(t *testing.T) *chainEnv {
	e := newEnv(t)
	f := &fakeChain{txs: map[string][]ChainEvent{}, err: map[string]error{}}
	e.srv.chain, e.srv.chainInfo = f, &ChainInfo{ChainID: 31337, Escrow: escrowAddr.Hex(), USDC: "0xabc"}

	ce := &chainEnv{env_: e, fake: f}
	ce.client, ce.clientID = e.signup("Client", "c@x.io")
	ce.dev, ce.devID = e.signup("Dev", "d@x.io")
	ce.stranger, _ = e.signup("Stranger", "s@x.io")
	e.srv.db.Exec(`UPDATE users SET wallet_address = ? WHERE id = ?`, clientAddr.Hex(), ce.clientID)
	e.srv.db.Exec(`UPDATE users SET wallet_address = ? WHERE id = ?`, freelancerAddr.Hex(), ce.devID)

	_, job := e.call("POST", "/api/jobs", ce.client, map[string]any{
		"title": "On-chain job here", "description": "A detailed description that is long enough.",
		"milestones": []map[string]any{{"title": "One", "amount": 400}, {"title": "Two", "amount": 900}},
	})
	ce.jobID = int(job["id"].(float64))
	for _, m := range job["milestones"].([]any) {
		ce.milestones = append(ce.milestones, int(m.(map[string]any)["id"].(float64)))
	}
	e.call("POST", fmt.Sprintf("/api/jobs/%d/apply", ce.jobID), ce.dev, map[string]string{"cover": "I can build this for you, quickly.", "githubUrl": "https://github.com/dev/escrow"})
	_, d := e.call("GET", fmt.Sprintf("/api/jobs/%d", ce.jobID), ce.client, nil)
	appID := int(d["applications"].([]any)[0].(map[string]any)["id"].(float64))
	code, out := e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", ce.jobID), ce.client, map[string]int{"applicationId": appID})
	e.mustOK(code, out, 200)
	return ce
}

func (c *chainEnv) milestone(i int, action, token string, body map[string]any) (int, map[string]any) {
	return c.call("POST", fmt.Sprintf("/api/milestones/%d/%s", c.milestones[i], action), token, body)
}

func (c *chainEnv) openEscrow(id int64) {
	tx := c.fake.add(ev("EscrowCreated", map[string]any{
		"escrowId": big.NewInt(id), "client": clientAddr, "freelancer": freelancerAddr,
		"amounts": []*big.Int{big.NewInt(400_000_000), big.NewInt(900_000_000)},
	}))
	code, out := c.call("POST", fmt.Sprintf("/api/jobs/%d/escrow", c.jobID), c.client, map[string]string{"txHash": tx})
	c.mustOK(code, out, 200)
}

func TestChainHireNeedsWallet(t *testing.T) {
	e := newEnv(t)
	e.srv.chain, e.srv.chainInfo = &fakeChain{}, &ChainInfo{ChainID: 31337, Escrow: escrowAddr.Hex()}
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io") // no wallet linked
	_, job := e.call("POST", "/api/jobs", client, map[string]any{
		"title": "Needs a wallet", "description": "A detailed description that is long enough.",
		"milestones": []map[string]any{{"title": "One", "amount": 10}},
	})
	id := int(job["id"].(float64))
	e.call("POST", fmt.Sprintf("/api/jobs/%d/apply", id), dev, map[string]string{"cover": "I can build this for you, quickly.", "githubUrl": "https://github.com/dev/escrow"})
	_, d := e.call("GET", fmt.Sprintf("/api/jobs/%d", id), client, nil)
	app := d["applications"].([]any)[0].(map[string]any)
	if app["hasWallet"] != false {
		t.Fatalf("hasWallet = %v", app["hasWallet"])
	}
	code, out := e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", id), client, map[string]int{"applicationId": int(app["id"].(float64))})
	e.mustOK(code, out, 409)
}

func TestChainEscrowCreationIsVerified(t *testing.T) {
	c := newChainEnv(t)
	good := map[string]any{
		"escrowId": big.NewInt(1), "client": clientAddr, "freelancer": freelancerAddr,
		"amounts": []*big.Int{big.NewInt(400_000_000), big.NewInt(900_000_000)},
	}
	post := func(token string, tx string) (int, map[string]any) {
		return c.call("POST", fmt.Sprintf("/api/jobs/%d/escrow", c.jobID), token, map[string]string{"txHash": tx})
	}
	clone := func(over map[string]any) map[string]any {
		m := map[string]any{}
		for k, v := range good {
			m[k] = v
		}
		for k, v := range over {
			m[k] = v
		}
		return m
	}

	// funding is refused until the escrow exists
	code, out := c.milestone(0, "fund", c.client, map[string]any{"txHash": c.fake.add(msEv("MilestoneFunded", 1, 0, nil))})
	c.mustOK(code, out, 409)

	// wrong client wallet, wrong freelancer, wrong amounts, no event at all
	code, out = post(c.client, c.fake.add(ev("EscrowCreated", clone(map[string]any{"client": freelancerAddr}))))
	c.mustOK(code, out, 400)
	code, out = post(c.client, c.fake.add(ev("EscrowCreated", clone(map[string]any{"freelancer": clientAddr}))))
	c.mustOK(code, out, 400)
	code, out = post(c.client, c.fake.add(ev("EscrowCreated", clone(map[string]any{"amounts": []*big.Int{big.NewInt(1), big.NewInt(2)}}))))
	c.mustOK(code, out, 400)
	code, out = post(c.client, c.fake.add(msEv("MilestoneFunded", 1, 0, nil)))
	c.mustOK(code, out, 400)

	// only the client may attach it
	tx := c.fake.add(ev("EscrowCreated", clone(nil)))
	code, out = post(c.dev, tx)
	c.mustOK(code, out, 403)

	code, out = post(c.client, tx)
	out = c.mustOK(code, out, 200)
	if out["escrowId"] != float64(1) {
		t.Fatalf("escrowId = %v", out["escrowId"])
	}
	if out["clientWallet"] != clientAddr.Hex() || out["freelancerWallet"] != freelancerAddr.Hex() {
		t.Fatalf("wallets not exposed to participants: %v %v", out["clientWallet"], out["freelancerWallet"])
	}

	// a second escrow cannot be attached to the same job
	code, out = post(c.client, c.fake.add(ev("EscrowCreated", clone(map[string]any{"escrowId": big.NewInt(2)}))))
	c.mustOK(code, out, 409)
}

func TestChainMilestoneLifecycle(t *testing.T) {
	c := newChainEnv(t)
	c.openEscrow(5)
	url := "https://github.com/acme/repo/pull/1"
	hash := [32]byte(crypto.Keccak256Hash([]byte(url)))

	// a transaction for a different milestone or a different escrow does not count
	code, out := c.milestone(0, "fund", c.client, map[string]any{"txHash": c.fake.add(msEv("MilestoneFunded", 5, 1, nil))})
	c.mustOK(code, out, 400)
	code, out = c.milestone(0, "fund", c.client, map[string]any{"txHash": c.fake.add(msEv("MilestoneFunded", 6, 0, nil))})
	c.mustOK(code, out, 400)
	// missing / malformed hash
	code, out = c.milestone(0, "fund", c.client, map[string]any{})
	c.mustOK(code, out, 400)

	fundTx := c.fake.add(msEv("MilestoneFunded", 5, 0, nil))
	code, out = c.milestone(0, "fund", c.client, map[string]any{"txHash": fundTx})
	c.mustOK(code, out, 200)
	// replaying the same request is harmless
	code, out = c.milestone(0, "fund", c.client, map[string]any{"txHash": fundTx})
	c.mustOK(code, out, 200)

	// strangers cannot push state
	code, out = c.milestone(0, "dispute", c.stranger, map[string]any{"txHash": c.fake.add(msEv("MilestoneDisputed", 5, 0, nil)), "reason": "Delivery does not match the brief."})
	c.mustOK(code, out, 403)

	// the link must match the on-chain hash
	subTx := c.fake.add(msEv("WorkSubmitted", 5, 0, map[string]any{"deliverable": hash}))
	code, out = c.milestone(0, "submit", c.dev, map[string]any{"txHash": subTx, "deliverableUrl": "https://evil.example/other"})
	c.mustOK(code, out, 400)
	code, out = c.milestone(0, "submit", c.dev, map[string]any{"txHash": subTx, "deliverableUrl": url})
	out = c.mustOK(code, out, 200)
	if m := out["milestones"].([]any)[0].(map[string]any); m["status"] != "submitted" || m["deliverableUrl"] != url {
		t.Fatalf("milestone after submit: %v", m)
	}

	// out-of-order: cannot be refunded once submitted
	code, out = c.milestone(0, "refund", c.client, map[string]any{"txHash": c.fake.add(msEv("MilestoneRefunded", 5, 0, nil))})
	c.mustOK(code, out, 409)

	relTx := c.fake.add(msEv("MilestoneReleased", 5, 0, map[string]any{"freelancerAmount": big.NewInt(392_000_000), "fee": big.NewInt(8_000_000)}))
	code, out = c.milestone(0, "approve", c.client, map[string]any{"txHash": relTx})
	out = c.mustOK(code, out, 200)
	if m := out["milestones"].([]any)[0].(map[string]any); m["status"] != "released" || m["freelancerBps"] != float64(10000) || m["releaseTx"] != relTx {
		t.Fatalf("milestone after release: %v", m)
	}
	if out["status"] == "completed" {
		t.Fatal("job must stay open while a milestone is outstanding")
	}

	// second milestone ends in a dispute the arbiter splits 60/40; the job then completes
	code, out = c.milestone(1, "fund", c.client, map[string]any{"txHash": c.fake.add(msEv("MilestoneFunded", 5, 1, nil))})
	c.mustOK(code, out, 200)
	code, out = c.milestone(1, "dispute", c.dev, map[string]any{"txHash": c.fake.add(msEv("MilestoneDisputed", 5, 1, nil)), "reason": "Delivery does not match the brief."})
	c.mustOK(code, out, 200)
	resTx := c.fake.add(msEv("MilestoneResolved", 5, 1, map[string]any{"freelancerBps": uint16(6000)}))
	code, out = c.milestone(1, "resolve", c.client, map[string]any{"txHash": resTx})
	out = c.mustOK(code, out, 200)
	if m := out["milestones"].([]any)[1].(map[string]any); m["status"] != "resolved" || m["freelancerBps"] != float64(6000) {
		t.Fatalf("milestone after resolve: %v", m)
	}
	if out["status"] != "completed" {
		t.Fatalf("job status = %v, want completed", out["status"])
	}
	var done int
	c.srv.db.QueryRow(`SELECT COALESCE(SUM(jobs_done),0) FROM developers`).Scan(&done)
	if done != 0 { // the dev in this test has no developer profile row
		t.Fatalf("jobs_done = %d", done)
	}
}

func TestChainTransactionProblemsAreReported(t *testing.T) {
	c := newChainEnv(t)
	c.openEscrow(1)

	pending := fmt.Sprintf("0x%064x", 777_001)
	code, out := c.milestone(0, "fund", c.client, map[string]any{"txHash": pending})
	c.mustOK(code, out, 409) // not mined yet: tell the user to retry

	reverted := fmt.Sprintf("0x%064x", 777_002)
	c.fake.err[reverted] = errTxReverted
	code, out = c.milestone(0, "fund", c.client, map[string]any{"txHash": reverted})
	c.mustOK(code, out, 400)

	code, out = c.milestone(0, "fund", c.client, map[string]any{"txHash": "not-a-hash"})
	c.mustOK(code, out, 400)
}
