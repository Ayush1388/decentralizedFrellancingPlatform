package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"
)

// version identifies the running build: Render sets RENDER_GIT_COMMIT on every deploy.
func version() string {
	if c := os.Getenv("RENDER_GIT_COMMIT"); len(c) >= 7 {
		return c[:7]
	}
	return "dev"
}

// handleHealth is for uptime monitors: it checks the database too, so "up" means the site actually works.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err := s.db.PingContext(ctx); err != nil {
		writeJSON(w, 503, map[string]string{"status": "degraded", "db": "unreachable", "version": version()})
		return
	}
	writeJSON(w, 200, map[string]string{"status": "ok", "db": "ok", "version": version()})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// logged records one line per request (method, path, status, time) and turns a crash in a handler into a
// 500 response plus a log entry, instead of a dropped connection.
func (s *Server) logged(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 200}
		defer func() {
			if p := recover(); p != nil {
				log.Printf("PANIC %s %s: %v", r.Method, r.URL.Path, p)
				if rec.status == 200 {
					writeErr(rec, 500, "Something went wrong on our side. Please try again.")
				}
			}
			if r.URL.Path != "/api/health" && r.Method != http.MethodOptions {
				log.Printf("%s %s %d %s", r.Method, r.URL.Path, rec.status, time.Since(start).Round(time.Millisecond))
			}
		}()
		next.ServeHTTP(rec, r)
	})
}
