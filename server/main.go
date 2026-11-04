package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"
)

type Server struct {
	cfg       Config
	db        *DB
	chain     Verifier   // nil in off-chain preview mode
	chainInfo *ChainInfo // nil in off-chain preview mode
	mailer    Mailer     // nil when SMTP is not configured
	limiter   *limiter
	syncMail  bool // tests: send mail inline instead of in the background
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	auth := s.requireAuth

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		cfg := map[string]any{
			"feeBps": s.cfg.FeeBps, "claimAfterDays": s.cfg.ClaimAfterDays, "refundAfterDays": s.cfg.RefundAfterDays,
			"googleEnabled":    s.cfg.GoogleClientID != "",
			"emailEnabled":     s.mailer != nil,
			"turnstileSiteKey": s.cfg.TurnstileSiteKey,
			"categories":       jobCategories,
			"chain":            s.chainInfo,
		}
		// The demo account is public on purpose: it only owns seeded demo data.
		if os.Getenv("SEED_DEMO") == "true" {
			cfg["demoLogin"] = map[string]string{"email": DemoEmail, "password": DemoPassword}
		}
		writeJSON(w, 200, cfg)
	})

	// auth
	mux.HandleFunc("POST /api/auth/signup", s.limited("signup", 20, time.Hour, s.handleSignup))
	mux.HandleFunc("POST /api/auth/login", s.limited("login", 30, 10*time.Minute, s.handleLogin))
	mux.HandleFunc("POST /api/auth/verify", s.limited("verify", 30, time.Hour, s.handleVerifyEmail))
	mux.HandleFunc("POST /api/auth/resend-verification", auth(s.limitedAuth("resend", 5, time.Hour, s.handleResendVerification)))
	mux.HandleFunc("POST /api/auth/forgot", s.limited("forgot", 10, time.Hour, s.handleForgotPassword))
	mux.HandleFunc("POST /api/auth/reset", s.limited("reset", 20, time.Hour, s.handleResetPassword))
	mux.HandleFunc("POST /api/auth/password", auth(s.limitedAuth("password", 10, time.Hour, s.handleChangePassword)))
	mux.HandleFunc("POST /api/auth/logout-all", auth(s.handleLogoutAll))
	mux.HandleFunc("POST /api/auth/email", auth(s.limitedAuth("set-email", 5, time.Hour, s.handleSetEmail)))
	mux.HandleFunc("GET /api/auth/export", auth(s.handleExport))
	mux.HandleFunc("POST /api/auth/delete", auth(s.handleDeleteAccount))
	mux.HandleFunc("GET /api/auth/me", auth(s.handleMe))
	mux.HandleFunc("POST /api/auth/notifications", auth(s.handleNotifications))
	mux.HandleFunc("GET /api/auth/google", s.handleGoogleStart)
	mux.HandleFunc("GET /api/auth/google/callback", s.handleGoogleCallback)
	mux.HandleFunc("GET /api/auth/wallet/nonce", s.limited("nonce", 60, 10*time.Minute, s.handleWalletNonce))
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
	mux.HandleFunc("POST /api/jobs/{id}/messages", auth(s.limitedAuth("message", 200, time.Hour, s.handlePostMessage)))
	mux.HandleFunc("POST /api/jobs/{id}/attachments", auth(s.limitedAuth("upload", 40, time.Hour, s.handleJobAttachment)))
	mux.HandleFunc("DELETE /api/files/{id}", auth(s.handleDeleteFile))
	mux.HandleFunc("GET /api/notifications", auth(s.handleListNotifications))
	mux.HandleFunc("POST /api/notifications/read", auth(s.handleReadNotifications))
	mux.HandleFunc("GET /api/unread", auth(s.handleUnread))
	mux.HandleFunc("POST /api/milestones/{id}/{action}", auth(s.handleMilestoneAction))

	// applications
	mux.HandleFunc("POST /api/applications/{id}/status", auth(s.handleApplicationStatus))
	mux.HandleFunc("DELETE /api/applications/{id}", auth(s.handleWithdrawApplication))
	mux.HandleFunc("GET /api/applications/{id}/messages", auth(s.handleListAppMessages))
	mux.HandleFunc("POST /api/applications/{id}/messages", auth(s.limitedAuth("message", 200, time.Hour, s.handlePostAppMessage)))
	mux.HandleFunc("POST /api/jobs/{id}/review", auth(s.handleReview))
	mux.HandleFunc("POST /api/jobs/{id}/review/reply", auth(s.handleReviewReply))
	mux.HandleFunc("PUT /api/jobs/{id}", auth(s.handleUpdateJob))
	mux.HandleFunc("POST /api/jobs/{id}/publish", auth(s.handlePublishJob))
	mux.HandleFunc("POST /api/jobs/{id}/repost", auth(s.handleRepostJob))
	mux.HandleFunc("PUT /api/jobs/{id}/milestones", auth(s.handleSetMilestones))
	mux.HandleFunc("POST /api/jobs/{id}/followup", auth(s.handleFollowup))
	mux.HandleFunc("GET /api/jobs/saved", auth(s.handleSavedJobs))
	mux.HandleFunc("GET /api/saved-ids", auth(s.handleSavedIDs))
	mux.HandleFunc("POST /api/jobs/{id}/save", auth(s.handleSaveJob))
	mux.HandleFunc("DELETE /api/jobs/{id}/save", auth(s.handleUnsaveJob))
	mux.HandleFunc("GET /api/admin/disputes", auth(s.handleAdminDisputes))
	mux.HandleFunc("GET /api/files/{id}", s.handleGetFile)

	return cors(s.cfg.FrontendURL, mux)
}

func main() {
	cfg := loadConfig()
	db, err := openDB(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()

	if os.Getenv("SEED_DEMO") == "true" {
		if err := seedDemo(db); err != nil {
			log.Printf("demo seed: %v", err)
		}
		go func() { // a server that stays up for weeks must keep the sample postings open too
			for range time.Tick(6 * time.Hour) {
				keepDemoPostingsOpen(db)
			}
		}()
	}

	s := &Server{cfg: cfg, db: db, mailer: newMailer(cfg), limiter: newLimiter()}
	go s.runNotifier(context.Background()) // in-app notifications and reminders always run; email only with SMTP
	if s.mailer != nil {
		log.Printf("Email on (SMTP %s:%s)", cfg.SMTPHost, cfg.SMTPPort)
	} else {
		log.Println("SMTP_HOST not set: email is off (verification, resets and notification emails)")
	}
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
