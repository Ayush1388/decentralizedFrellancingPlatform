package main

import (
	"context"
	"log"
	"net/http"
	"time"
)

type Server struct {
	cfg       Config
	db        *DB
	chain     Verifier   // nil in off-chain preview mode
	chainInfo *ChainInfo // nil in off-chain preview mode
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	auth := s.requireAuth

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{
			"feeBps": s.cfg.FeeBps, "claimAfterDays": s.cfg.ClaimAfterDays, "refundAfterDays": s.cfg.RefundAfterDays,
			"googleEnabled": s.cfg.GoogleClientID != "",
			"chain":         s.chainInfo,
		})
	})

	// auth
	mux.HandleFunc("POST /api/auth/signup", s.handleSignup)
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("GET /api/auth/me", auth(s.handleMe))
	mux.HandleFunc("GET /api/auth/google", s.handleGoogleStart)
	mux.HandleFunc("GET /api/auth/google/callback", s.handleGoogleCallback)
	mux.HandleFunc("GET /api/auth/wallet/nonce", s.handleWalletNonce)
	mux.HandleFunc("POST /api/auth/wallet/verify", s.handleWalletVerify)

	// developers
	mux.HandleFunc("GET /api/developers", s.handleListDevelopers)
	mux.HandleFunc("GET /api/developers/{id}", s.handleGetDeveloper)
	mux.HandleFunc("POST /api/developers", auth(s.handleCreateDeveloper))
	mux.HandleFunc("PUT /api/developers/{id}", auth(s.handleUpdateDeveloper))
	mux.HandleFunc("DELETE /api/developers/{id}", auth(s.handleDeleteDeveloper))

	// jobs
	mux.HandleFunc("GET /api/jobs", s.handleListJobs)
	mux.HandleFunc("GET /api/jobs/mine", auth(s.handleMyJobs))
	mux.HandleFunc("POST /api/jobs", auth(s.handleCreateJob))
	mux.HandleFunc("GET /api/jobs/{id}", s.handleGetJob)
	mux.HandleFunc("POST /api/jobs/{id}/apply", auth(s.handleApply))
	mux.HandleFunc("POST /api/jobs/{id}/hire", auth(s.handleHire))
	mux.HandleFunc("POST /api/jobs/{id}/cancel", auth(s.handleCancelJob))
	mux.HandleFunc("POST /api/jobs/{id}/escrow", auth(s.handleCreateEscrow))
	mux.HandleFunc("GET /api/jobs/{id}/messages", auth(s.handleListMessages))
	mux.HandleFunc("POST /api/jobs/{id}/messages", auth(s.handlePostMessage))
	mux.HandleFunc("POST /api/milestones/{id}/{action}", auth(s.handleMilestoneAction))

	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(s.cfg.UploadDir))))

	return cors(s.cfg.FrontendURL, mux)
}

func main() {
	cfg := loadConfig()
	db, err := openDB(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()

	s := &Server{cfg: cfg, db: db}
	if cfg.EscrowAddress != "" && cfg.RPCURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		c, info, err := newChain(ctx, cfg.RPCURL, cfg.EscrowAddress, cfg.ChainID)
		cancel()
		if err != nil {
			log.Fatalf("chain: %v", err)
		}
		s.chain, s.chainInfo = c, info
		log.Printf("On-chain escrow enabled: contract %s on chain %d (USDC %s)", info.Escrow, info.ChainID, info.USDC)
	} else {
		log.Println("ESCROW_ADDRESS/RPC_URL not set: milestones are tracked off-chain (preview mode)")
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           s.routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
	}
	log.Printf("API listening on http://localhost:%s", cfg.Port)
	log.Fatal(srv.ListenAndServe())
}
