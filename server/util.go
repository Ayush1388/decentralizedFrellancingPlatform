package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"net/url"
	"strconv"
	"strings"
	"time"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"message": msg})
}

func decodeJSON(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	return json.NewDecoder(r.Body).Decode(v)
}

func pathID(r *http.Request, name string) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid id")
	}
	return id, nil
}

func now() time.Time { return time.Now().UTC() }

func validEmail(s string) bool {
	a, err := mail.ParseAddress(s)
	return err == nil && a.Address == s
}

func parseSkills(s string) []string {
	var out []string
	_ = json.Unmarshal([]byte(s), &out)
	if out == nil {
		out = []string{}
	}
	return out
}

// cleanSkills trims, de-duplicates and caps a skill list; accepts the
// comma-separated form the profile form submits.
func cleanSkills(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range in {
		for _, p := range strings.Split(s, ",") {
			p = strings.TrimSpace(p)
			if p == "" || seen[strings.ToLower(p)] || len(p) > 32 {
				continue
			}
			seen[strings.ToLower(p)] = true
			out = append(out, p)
			if len(out) == 12 {
				return out
			}
		}
	}
	return out
}

func skillsJSON(in []string) string {
	b, _ := json.Marshal(cleanSkills(in))
	return string(b)
}

// cors lets the configured frontend origin call the API. Any loopback origin is
// also allowed so the dev server works on whatever port Vite picks.
func cors(origin string, next http.Handler) http.Handler {
	allowed := func(o string) bool {
		if o == origin {
			return true
		}
		u, err := url.Parse(o)
		if err != nil {
			return false
		}
		h := u.Hostname()
		return h == "localhost" || h == "127.0.0.1" || h == "::1"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if o := r.Header.Get("Origin"); o != "" && allowed(o) {
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
