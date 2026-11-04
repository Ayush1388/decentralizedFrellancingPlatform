package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

type ctxKey int

const userKey ctxKey = 1

type User struct {
	ID            int64   `json:"id"`
	Name          string  `json:"name"`
	Email         *string `json:"email"`
	WalletAddress *string `json:"walletAddress"`
	IsAdmin       bool    `json:"isAdmin"`
	NotifyEmail   bool    `json:"notifyEmail"`
	EmailVerified bool    `json:"emailVerified"`
	HasPassword   bool    `json:"hasPassword"`
}

type authBody struct {
	Name        string `json:"name"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	AcceptTerms bool   `json:"acceptTerms"`
	Captcha     string `json:"captcha"`
}

func (s *Server) issueToken(uid int64) (string, error) {
	var v int
	s.db.QueryRow(`SELECT token_version FROM users WHERE id = ?`, uid).Scan(&v)
	// "v" is the account's token version: changing the password or logging out everywhere bumps it,
	// which makes every older token stop working.
	claims := jwt.MapClaims{"id": uid, "v": v, "exp": time.Now().Add(24 * time.Hour).Unix()}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.cfg.JWTSecret)
}

func (s *Server) userByID(id int64) (User, error) {
	var u User
	err := s.db.QueryRow(`SELECT id, name, email, wallet_address, notify_email, email_verified, password_hash IS NOT NULL FROM users WHERE id = ? AND deleted_at IS NULL`, id).
		Scan(&u.ID, &u.Name, &u.Email, &u.WalletAddress, &u.NotifyEmail, &u.EmailVerified, &u.HasPassword)
	if u.Email != nil {
		u.IsAdmin = s.cfg.AdminEmails[strings.ToLower(*u.Email)]
	}
	return u, err
}

func (s *Server) respondWithSession(w http.ResponseWriter, status int, uid int64) {
	tok, err := s.issueToken(uid)
	if err != nil {
		writeErr(w, 500, "could not issue token")
		return
	}
	u, err := s.userByID(uid)
	if err != nil {
		writeErr(w, 500, "user not found")
		return
	}
	writeJSON(w, status, map[string]any{"token": tok, "user": u})
}

// uidFromRequest returns the user id from a valid bearer token, or 0.
func (s *Server) uidFromRequest(r *http.Request) int64 {
	h := r.Header.Get("Authorization")
	raw, ok := strings.CutPrefix(h, "Bearer ")
	if !ok {
		return 0
	}
	tok, err := jwt.Parse(raw, func(t *jwt.Token) (any, error) { return s.cfg.JWTSecret, nil },
		jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !tok.Valid {
		return 0
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return 0
	}
	id, _ := claims["id"].(float64)
	v, _ := claims["v"].(float64)
	var cur int
	var banned, gone bool
	if s.db.QueryRow(`SELECT token_version, banned_at IS NOT NULL, deleted_at IS NOT NULL FROM users WHERE id = ?`, int64(id)).Scan(&cur, &banned, &gone) != nil ||
		cur != int(v) || banned || gone {
		return 0
	}
	return int64(id)
}

func (s *Server) requireAuth(next func(http.ResponseWriter, *http.Request, int64)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := s.uidFromRequest(r)
		if uid == 0 {
			writeErr(w, 401, "login required")
			return
		}
		next(w, r, uid)
	}
}

func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	var b authBody
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	b.Name, b.Email = strings.TrimSpace(b.Name), strings.ToLower(strings.TrimSpace(b.Email))
	switch {
	case len(b.Name) < 2:
		writeErr(w, 400, "Name is too short")
		return
	case !validEmail(b.Email):
		writeErr(w, 400, "Enter a valid email address")
		return
	case len(b.Password) < 8 || len(b.Password) > 72:
		writeErr(w, 400, "Password must be 8 to 72 characters")
		return
	}
	if !b.AcceptTerms {
		writeErr(w, 400, "Accept the terms and privacy policy to create an account")
		return
	}
	if !s.captchaOK(b.Captcha, clientIP(r)) {
		writeErr(w, 400, "Please complete the human check")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(b.Password), bcrypt.DefaultCost)
	if err != nil {
		writeErr(w, 500, "could not hash password")
		return
	}
	// With email delivery on, the address must be confirmed before the account can post or apply.
	id, err := insertID(s.db, `INSERT INTO users (name, email, password_hash, email_verified, terms_accepted_at) VALUES (?, ?, ?, ?, now())`,
		b.Name, b.Email, string(hash), s.mailer == nil)
	if err != nil {
		if isUnique(err) {
			writeErr(w, 409, "An account with this email already exists")
			return
		}
		writeErr(w, 500, "could not create account")
		return
	}
	if s.mailer != nil {
		s.sendVerification(id, b.Email)
	}
	s.respondWithSession(w, 201, id)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var b authBody
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(b.Email))
	// Slow down guessing against one account, whatever address the guesses come from.
	if email != "" && !s.rateOK(w, "login-email", email, 8, 15*time.Minute) {
		return
	}
	var id int64
	var hash sql.NullString
	var banned, gone bool
	err := s.db.QueryRow(`SELECT id, password_hash, banned_at IS NOT NULL, deleted_at IS NOT NULL FROM users WHERE email = ?`, email).Scan(&id, &hash, &banned, &gone)
	// Same response for unknown email and wrong password so accounts cannot be enumerated.
	if err != nil || gone || !hash.Valid || bcrypt.CompareHashAndPassword([]byte(hash.String), []byte(b.Password)) != nil {
		writeErr(w, 401, "Invalid email or password")
		return
	}
	if banned {
		writeErr(w, 403, "This account has been suspended. Contact support if you think that is a mistake.")
		return
	}
	s.respondWithSession(w, 200, id)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request, uid int64) {
	u, err := s.userByID(uid)
	if err != nil {
		writeErr(w, 401, "account no longer exists")
		return
	}
	writeJSON(w, 200, u)
}

// handleNotifications turns the caller's email notifications on or off.
func (s *Server) handleNotifications(w http.ResponseWriter, r *http.Request, uid int64) {
	var b struct {
		Enabled bool `json:"enabled"`
	}
	if decodeJSON(r, &b) != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	if _, err := s.db.Exec(`UPDATE users SET notify_email = ? WHERE id = ?`, b.Enabled, uid); err != nil {
		writeErr(w, 500, "could not save the setting")
		return
	}
	u, err := s.userByID(uid)
	if err != nil {
		writeErr(w, 401, "account no longer exists")
		return
	}
	writeJSON(w, 200, u)
}

// ---------- Google OAuth ----------

func (s *Server) googleConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     s.cfg.GoogleClientID,
		ClientSecret: s.cfg.GoogleClientSecret,
		RedirectURL:  s.cfg.GoogleCallbackURL,
		Scopes:       []string{"openid", "profile", "email"},
		Endpoint:     google.Endpoint,
	}
}

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Server) handleGoogleStart(w http.ResponseWriter, r *http.Request) {
	if s.cfg.GoogleClientID == "" {
		writeErr(w, 503, "Google login is not configured on this server")
		return
	}
	state := randomHex(16)
	http.SetCookie(w, &http.Cookie{Name: "oauth_state", Value: state, Path: "/api/auth/google", MaxAge: 600, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	http.Redirect(w, r, s.googleConfig().AuthCodeURL(state), http.StatusFound)
}

func (s *Server) handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	fail := func() { http.Redirect(w, r, s.cfg.FrontendURL+"/oauth-success?error=google", http.StatusFound) }
	c, err := r.Cookie("oauth_state")
	if err != nil || c.Value == "" || c.Value != r.URL.Query().Get("state") {
		fail()
		return
	}
	cfg := s.googleConfig()
	tok, err := cfg.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		fail()
		return
	}
	resp, err := cfg.Client(r.Context(), tok).Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		fail()
		return
	}
	defer resp.Body.Close()
	var info struct {
		ID            string `json:"id"`
		Email         string `json:"email"`
		Name          string `json:"name"`
		VerifiedEmail bool   `json:"verified_email"`
	}
	if json.NewDecoder(resp.Body).Decode(&info) != nil || info.ID == "" || !info.VerifiedEmail {
		fail()
		return
	}
	email := strings.ToLower(info.Email)

	var uid int64
	err = s.db.QueryRow(`SELECT id FROM users WHERE google_id = ?`, info.ID).Scan(&uid)
	if errors.Is(err, sql.ErrNoRows) {
		// Link to an existing email/password account, otherwise create one.
		err = s.db.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&uid)
		if err == nil {
			_, err = s.db.Exec(`UPDATE users SET google_id = ? WHERE id = ?`, info.ID, uid)
		} else if errors.Is(err, sql.ErrNoRows) {
			uid, err = insertID(s.db, `INSERT INTO users (name, email, google_id, terms_accepted_at) VALUES (?, ?, ?, now())`, info.Name, email, info.ID)
		}
	}
	if err != nil {
		fail()
		return
	}
	var banned, gone bool
	s.db.QueryRow(`SELECT banned_at IS NOT NULL, deleted_at IS NOT NULL FROM users WHERE id = ?`, uid).Scan(&banned, &gone)
	if banned || gone {
		http.Redirect(w, r, s.cfg.FrontendURL+"/oauth-success?error=suspended", http.StatusFound)
		return
	}
	t, err := s.issueToken(uid)
	if err != nil {
		fail()
		return
	}
	http.Redirect(w, r, s.cfg.FrontendURL+"/oauth-success?token="+t, http.StatusFound)
}

// ---------- Sign-In with Ethereum (EIP-191 personal_sign) ----------

func walletMessage(addr, nonce string) string {
	return fmt.Sprintf("Sign in to Web3 Freelance.\n\nThis proves you control %s. It costs no gas.\n\nNonce: %s", addr, nonce)
}

func (s *Server) handleWalletNonce(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("address")
	if !common.IsHexAddress(raw) {
		writeErr(w, 400, "invalid wallet address")
		return
	}
	addr := common.HexToAddress(raw).Hex() // checksummed
	nonce := randomHex(16)
	_, err := s.db.Exec(`INSERT INTO wallet_nonces (address, nonce, expires_at) VALUES (?, ?, ?)
		ON CONFLICT(address) DO UPDATE SET nonce = excluded.nonce, expires_at = excluded.expires_at`,
		addr, nonce, time.Now().Add(10*time.Minute).UTC())
	if err != nil {
		writeErr(w, 500, "could not create nonce")
		return
	}
	writeJSON(w, 200, map[string]string{"address": addr, "nonce": nonce, "message": walletMessage(addr, nonce)})
}

// recoverSigner returns the address that produced an EIP-191 personal_sign signature.
func recoverSigner(message, sigHex string) (common.Address, error) {
	sig, err := hex.DecodeString(strings.TrimPrefix(sigHex, "0x"))
	if err != nil || len(sig) != 65 {
		return common.Address{}, errors.New("bad signature")
	}
	if sig[64] >= 27 {
		sig[64] -= 27
	}
	hash := crypto.Keccak256([]byte(fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(message), message)))
	pub, err := crypto.SigToPub(hash, sig)
	if err != nil {
		return common.Address{}, err
	}
	return crypto.PubkeyToAddress(*pub), nil
}

func (s *Server) handleWalletVerify(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Address   string `json:"address"`
		Signature string `json:"signature"`
	}
	if decodeJSON(r, &b) != nil || !common.IsHexAddress(b.Address) {
		writeErr(w, 400, "invalid request body")
		return
	}
	addr := common.HexToAddress(b.Address)

	var nonce, expires string
	err := s.db.QueryRow(`SELECT nonce, expires_at FROM wallet_nonces WHERE address = ?`, addr.Hex()).Scan(&nonce, &expires)
	exp, _ := time.Parse(time.RFC3339, expires)
	if err != nil || time.Now().After(exp) {
		writeErr(w, 400, "Sign-in request expired, try again")
		return
	}
	// One-shot: burn the nonce before checking the signature so it can never be replayed.
	s.db.Exec(`DELETE FROM wallet_nonces WHERE address = ?`, addr.Hex())

	signer, err := recoverSigner(walletMessage(addr.Hex(), nonce), b.Signature)
	if err != nil || signer != addr {
		writeErr(w, 401, "Signature does not match this wallet")
		return
	}

	if uid := s.uidFromRequest(r); uid != 0 { // already logged in: link the wallet
		_, err := s.db.Exec(`UPDATE users SET wallet_address = ? WHERE id = ?`, addr.Hex(), uid)
		if err != nil {
			writeErr(w, 409, "This wallet is already linked to another account")
			return
		}
		s.respondWithSession(w, 200, uid)
		return
	}

	var uid int64
	err = s.db.QueryRow(`SELECT id FROM users WHERE wallet_address = ?`, addr.Hex()).Scan(&uid)
	if errors.Is(err, sql.ErrNoRows) {
		short := addr.Hex()[:6] + "…" + addr.Hex()[38:]
		var ierr error
		uid, ierr = insertID(s.db, `INSERT INTO users (name, wallet_address) VALUES (?, ?)`, short, addr.Hex())
		if ierr != nil {
			writeErr(w, 500, "could not create account")
			return
		}
	} else if err != nil {
		writeErr(w, 500, "lookup failed")
		return
	}
	s.respondWithSession(w, 200, uid)
}
