package main

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port               string
	DatabaseURL        string
	UploadDir          string
	JWTSecret          []byte
	FrontendURL        string
	GoogleClientID     string
	GoogleClientSecret string
	GoogleCallbackURL  string
	AdminEmails        map[string]bool
	ClaimAfterDays     int    // freelancer may claim a submitted milestone after this many days of client silence
	RefundAfterDays    int    // client may reclaim a funded milestone with no submission after this many days
	FeeBps             int    // platform fee in basis points, taken on release
	EscrowAddress      string // JobEscrow contract; empty runs the API in off-chain preview mode
	ChainID            int64
	RPCURL             string
}

// loadDotEnv reads KEY=VALUE lines from path into the process environment
// without overriding variables that are already set.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.Trim(strings.TrimSpace(v), `"'`)
		if os.Getenv(k) == "" {
			os.Setenv(k, v)
		}
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return v
	}
	return def
}

func loadConfig() Config {
	loadDotEnv(".env")

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		b := make([]byte, 32)
		rand.Read(b)
		secret = hex.EncodeToString(b)
		log.Println("JWT_SECRET not set: using a random secret, sessions will not survive a restart")
	}

	admins := map[string]bool{}
	for _, e := range strings.Split(os.Getenv("ADMIN_EMAILS"), ",") {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			admins[e] = true
		}
	}

	port := env("PORT", "3001")
	return Config{
		Port:               port,
		DatabaseURL:        env("DATABASE_URL", "postgres://freelance:freelance@localhost:5434/freelance?sslmode=disable"),
		UploadDir:          env("UPLOAD_DIR", "uploads"),
		JWTSecret:          []byte(secret),
		FrontendURL:        strings.TrimRight(env("FRONTEND_URL", "http://localhost:5173"), "/"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleCallbackURL:  env("GOOGLE_CALLBACK_URL", "http://localhost:"+port+"/api/auth/google/callback"),
		AdminEmails:        admins,
		ClaimAfterDays:     envInt("CLAIM_AFTER_DAYS", 7),
		RefundAfterDays:    envInt("REFUND_AFTER_DAYS", 14),
		FeeBps:             envInt("FEE_BPS", 200),
		EscrowAddress:      os.Getenv("ESCROW_ADDRESS"),
		ChainID:            int64(envInt("CHAIN_ID", 0)),
		RPCURL:             os.Getenv("RPC_URL"),
	}
}
