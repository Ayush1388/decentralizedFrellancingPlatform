package main

import (
	"bytes"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/ethereum/go-ethereum/crypto"
)

type env_ struct {
	t   *testing.T
	srv *Server
	h   http.Handler
}

func newEnv(t *testing.T) *env_ {
	t.Helper()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		base = "postgres://freelance:freelance@localhost:5434/freelance?sslmode=disable"
	}
	// Each test gets its own schema so tests are isolated and can run against the dev database.
	schemaName := "t_" + randomHex(6)
	admin, err := sql.Open("pgx", base)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := admin.Exec("CREATE SCHEMA " + schemaName); err != nil {
		t.Skipf("Postgres not reachable (run `docker compose up -d`): %v", err)
	}
	t.Cleanup(func() {
		admin.Exec("DROP SCHEMA " + schemaName + " CASCADE")
		admin.Close()
	})

	cfg := Config{
		DatabaseURL: base + "&search_path=" + schemaName, UploadDir: t.TempDir(), JWTSecret: []byte("test"),
		FrontendURL: "http://localhost:5173", AdminEmails: map[string]bool{"admin@x.io": true},
		ClaimAfterDays: 7, RefundAfterDays: 14, FeeBps: 200,
	}
	db, err := openDB(cfg.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := &Server{cfg: cfg, db: db}
	return &env_{t: t, srv: s, h: s.routes()}
}

func (e *env_) call(method, path, token string, body any) (int, map[string]any) {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	var out map[string]any
	json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func (e *env_) signup(name, email string) (string, int64) {
	code, out := e.call("POST", "/api/auth/signup", "", map[string]string{"name": name, "email": email, "password": "password123"})
	if code != 201 {
		e.t.Fatalf("signup %s: %d %v", email, code, out)
	}
	return out["token"].(string), int64(out["user"].(map[string]any)["id"].(float64))
}

func (e *env_) mustOK(code int, out map[string]any, want int) map[string]any {
	e.t.Helper()
	if code != want {
		e.t.Fatalf("status %d, want %d: %v", code, want, out)
	}
	return out
}

func TestEscrowLifecycle(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")
	if _, err := e.srv.db.Exec(`INSERT INTO developers (user_id, name, title, hourly_rate) VALUES (2, 'Dev', 'Solidity', 50)`); err != nil {
		t.Fatal(err)
	}

	code, job := e.call("POST", "/api/jobs", client, map[string]any{
		"title": "Build an escrow UI", "description": "A detailed description that is long enough.",
		"skills": []string{"React", "Solidity"}, "milestones": []map[string]any{{"title": "Design", "amount": 100}, {"title": "Build", "amount": 250.5}},
	})
	e.mustOK(code, job, 201)
	jobID := int(job["id"].(float64))
	ms := job["milestones"].([]any)
	m1 := int(ms[0].(map[string]any)["id"].(float64))
	m2 := int(ms[1].(map[string]any)["id"].(float64))
	if got := int64(job["total"].(float64)); got != 350_500_000 {
		t.Fatalf("total = %d", got)
	}

	// funding before hiring is refused
	code, out := e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", m1), client, nil)
	e.mustOK(code, out, 409)

	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/apply", jobID), dev, map[string]string{"cover": "I have shipped three escrow dapps.", "githubUrl": "https://github.com/dev/escrow"})
	e.mustOK(code, out, 201)
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/apply", jobID), client, map[string]string{"cover": "I have shipped three escrow dapps.", "githubUrl": "https://github.com/dev/escrow"})
	e.mustOK(code, out, 403)

	code, out = e.call("GET", fmt.Sprintf("/api/jobs/%d", jobID), client, nil)
	appID := int(out["applications"].([]any)[0].(map[string]any)["id"].(float64))
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), dev, map[string]int{"applicationId": appID})
	e.mustOK(code, out, 403)
	code, out = e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), client, map[string]int{"applicationId": appID})
	e.mustOK(code, out, 200)

	fund := func(id int) {
		c, o := e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", id), client, nil)
		e.mustOK(c, o, 200)
	}

	// dev cannot fund; submit needs funding first
	code, out = e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", m1), dev, nil)
	e.mustOK(code, out, 403)
	code, out = e.call("POST", fmt.Sprintf("/api/milestones/%d/submit", m1), dev, map[string]string{"deliverableUrl": "https://example.com/d"})
	e.mustOK(code, out, 409)

	fund(m1)
	code, out = e.call("POST", fmt.Sprintf("/api/milestones/%d/submit", m1), dev, map[string]string{"deliverableUrl": "javascript:alert(1)"})
	e.mustOK(code, out, 400)
	code, out = e.call("POST", fmt.Sprintf("/api/milestones/%d/submit", m1), dev, map[string]string{"deliverableUrl": "ipfs://bafy123"})
	e.mustOK(code, out, 200)

	// freelancer cannot claim inside the review window; client cannot approve twice
	code, out = e.call("POST", fmt.Sprintf("/api/milestones/%d/claim", m1), dev, nil)
	e.mustOK(code, out, 409)
	code, out = e.call("POST", fmt.Sprintf("/api/milestones/%d/approve", m1), client, map[string]string{"txHash": "0x" + hex.EncodeToString(make([]byte, 32))})
	e.mustOK(code, out, 200)
	code, out = e.call("POST", fmt.Sprintf("/api/milestones/%d/approve", m1), client, nil)
	e.mustOK(code, out, 409)

	// second milestone: silent client -> freelancer claim after the window
	fund(m2)
	e.call("POST", fmt.Sprintf("/api/milestones/%d/submit", m2), dev, map[string]string{"deliverableUrl": "https://example.com/final"})
	e.srv.db.Exec(`UPDATE milestones SET submitted_at = '2000-01-01T00:00:00Z' WHERE id = ?`, m2)
	code, out = e.call("POST", fmt.Sprintf("/api/milestones/%d/claim", m2), dev, nil)
	out = e.mustOK(code, out, 200)
	if out["status"] != "completed" {
		t.Fatalf("job status = %v, want completed", out["status"])
	}
	var done int
	e.srv.db.QueryRow(`SELECT jobs_done FROM developers WHERE user_id = 2`).Scan(&done)
	if done != 1 {
		t.Fatalf("jobs_done = %d", done)
	}
}

func TestDisputeOnlyArbiterResolves(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")
	admin, _ := e.signup("Admin", "admin@x.io")

	_, job := e.call("POST", "/api/jobs", client, map[string]any{
		"title": "Dispute me please", "description": "A detailed description that is long enough.",
		"milestones": []map[string]any{{"title": "Only", "amount": 10}},
	})
	jobID := int(job["id"].(float64))
	mid := int(job["milestones"].([]any)[0].(map[string]any)["id"].(float64))
	e.call("POST", fmt.Sprintf("/api/jobs/%d/apply", jobID), dev, map[string]string{"cover": "Hire me, I do good work always.", "githubUrl": "https://github.com/dev/escrow"})
	_, d := e.call("GET", fmt.Sprintf("/api/jobs/%d", jobID), client, nil)
	appID := int(d["applications"].([]any)[0].(map[string]any)["id"].(float64))
	e.call("POST", fmt.Sprintf("/api/jobs/%d/hire", jobID), client, map[string]int{"applicationId": appID})
	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", mid), client, nil)

	code, out := e.call("POST", fmt.Sprintf("/api/milestones/%d/dispute", mid), dev, map[string]string{"reason": "The client stopped replying to messages."})
	e.mustOK(code, out, 200)
	code, out = e.call("POST", fmt.Sprintf("/api/milestones/%d/resolve", mid), client, map[string]int{"freelancerPercent": 100})
	e.mustOK(code, out, 403)
	code, out = e.call("POST", fmt.Sprintf("/api/milestones/%d/resolve", mid), admin, map[string]int{"freelancerPercent": 101})
	e.mustOK(code, out, 400)
	code, out = e.call("POST", fmt.Sprintf("/api/milestones/%d/resolve", mid), admin, map[string]int{"freelancerPercent": 60})
	out = e.mustOK(code, out, 200)
	if out["status"] != "completed" {
		t.Fatalf("job should close after resolution, got %v", out["status"])
	}
}

func TestWalletSignIn(t *testing.T) {
	e := newEnv(t)
	key, _ := crypto.GenerateKey()
	addr := crypto.PubkeyToAddress(key.PublicKey).Hex()

	code, n := e.call("GET", "/api/auth/wallet/nonce?address="+addr, "", nil)
	e.mustOK(code, n, 200)
	msg := n["message"].(string)
	hash := crypto.Keccak256([]byte(fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(msg), msg)))
	sig, _ := crypto.Sign(hash, key)
	sig[64] += 27

	code, out := e.call("POST", "/api/auth/wallet/verify", "", map[string]string{"address": addr, "signature": "0x" + hex.EncodeToString(sig)})
	out = e.mustOK(code, out, 200)
	if out["user"].(map[string]any)["walletAddress"] != addr {
		t.Fatalf("wallet not linked: %v", out)
	}

	// the nonce is single-use, so replaying the same signature fails
	code, out = e.call("POST", "/api/auth/wallet/verify", "", map[string]string{"address": addr, "signature": "0x" + hex.EncodeToString(sig)})
	e.mustOK(code, out, 400)

	// a signature from a different key is rejected
	other, _ := crypto.GenerateKey()
	_, n = e.call("GET", "/api/auth/wallet/nonce?address="+addr, "", nil)
	msg = n["message"].(string)
	hash = crypto.Keccak256([]byte(fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(msg), msg)))
	bad, _ := crypto.Sign(hash, other)
	bad[64] += 27
	code, out = e.call("POST", "/api/auth/wallet/verify", "", map[string]string{"address": addr, "signature": "0x" + hex.EncodeToString(bad)})
	e.mustOK(code, out, 401)
}

func TestAuthBasics(t *testing.T) {
	e := newEnv(t)
	e.signup("Alice", "a@x.io")
	code, out := e.call("POST", "/api/auth/signup", "", map[string]string{"name": "Alice", "email": "a@x.io", "password": "password123"})
	e.mustOK(code, out, 409)
	code, out = e.call("POST", "/api/auth/login", "", map[string]string{"email": "a@x.io", "password": "wrongpass"})
	e.mustOK(code, out, 401)
	code, out = e.call("POST", "/api/jobs", "", map[string]any{})
	e.mustOK(code, out, 401)
}
