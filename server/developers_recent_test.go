package main

import "testing"

// The home page shows written reviews only, and says which ones come from the demo data.
func TestRecentReviews(t *testing.T) {
	e := newEnv(t)
	code, list := e.callList("GET", "/api/reviews/recent", "")
	if code != 200 || list == nil || len(list) != 0 {
		t.Fatalf("an empty platform should give an empty list, got %d %v", code, list)
	}

	if err := seedDemo(e.srv.db); err != nil {
		t.Fatal(err)
	}
	code, list = e.callList("GET", "/api/reviews/recent", "")
	if code != 200 || len(list) == 0 || len(list) > 6 {
		t.Fatalf("want 1 to 6 reviews, got %d: %v", code, list)
	}
	for _, v := range list {
		if len(v["comment"].(string)) < 20 {
			t.Fatalf("a short comment slipped through: %v", v)
		}
		if v["demo"] != true {
			t.Fatalf("seeded reviews must be flagged as demo: %v", v)
		}
		if v["role"] != "Client" && v["role"] != "Freelancer" {
			t.Fatalf("unexpected role: %v", v)
		}
	}
}
