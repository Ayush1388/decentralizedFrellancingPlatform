package main

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestSeedDemo(t *testing.T) {
	e := newEnv(t)
	for i := 0; i < 2; i++ { // second run must be a no-op
		if err := seedDemo(e.srv.db); err != nil {
			t.Fatal(err)
		}
	}

	var devs, jobs int
	e.srv.db.QueryRow(`SELECT COUNT(*) FROM developers`).Scan(&devs)
	e.srv.db.QueryRow(`SELECT COUNT(*) FROM jobs`).Scan(&jobs)
	if devs != len(demoDevs) || jobs != len(demoJobs) {
		t.Fatalf("seeded %d developers and %d jobs, want %d and %d", devs, jobs, len(demoDevs), len(demoJobs))
	}

	list := func(path, token string) []map[string]any {
		req := httptest.NewRequest("GET", path, nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		e.h.ServeHTTP(rec, req)
		var out []map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatalf("%s: %d %s", path, rec.Code, rec.Body)
		}
		return out
	}

	for _, d := range list("/api/developers", "") {
		if d["demo"] != true {
			t.Fatalf("developer %v not marked demo", d["name"])
		}
	}

	// The public demo account can log in and owns the client-side demo jobs.
	code, out := e.call("POST", "/api/auth/login", "", map[string]string{"email": DemoEmail, "password": DemoPassword})
	e.mustOK(code, out, 200)
	mine := list("/api/jobs/mine", out["token"].(string))
	if len(mine) != 3 {
		t.Fatalf("demo client has %d jobs, want 3", len(mine))
	}
	for _, j := range mine {
		if j["demo"] != true {
			t.Fatalf("job %v not marked demo", j["title"])
		}
	}
}
