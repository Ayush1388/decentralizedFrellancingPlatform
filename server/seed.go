package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// Demo data for showcases. Every user created here has is_demo = true, so the
// UI can label their profiles and jobs. Only the demo client can log in;
// the other demo users have no password.

const (
	DemoEmail    = "demo@blockchainfreelance.dev"
	DemoPassword = "demo1234"
)

type demoDev struct {
	name, title, bio string
	rate, jobs       int
	rating           float64
	skills           []string
}

var demoDevs = []demoDev{
	{"Aarav Mehta", "Smart contract engineer", "Writes and tests Solidity for escrow, staking and vesting contracts. Foundry-first, gas-aware.", 85, 23, 4.9, []string{"Solidity", "Foundry", "Security"}},
	{"Lena Kovač", "Frontend engineer for dapps", "Builds wallet-connected React apps with wagmi and viem. Cares about loading and error states.", 70, 31, 4.8, []string{"React", "TypeScript", "wagmi"}},
	{"Diego Álvarez", "Full-stack Web3 developer", "Go APIs, Postgres and React frontends that read from the chain and never trust the client.", 65, 12, 4.7, []string{"Go", "React", "PostgreSQL"}},
	{"Mei Tanaka", "Protocol auditor", "Reviews DeFi protocols line by line and writes findings that a team can actually act on.", 120, 40, 5.0, []string{"Solidity", "Audits", "Formal verification"}},
	{"Samuel Okoro", "Product designer, Web3", "Designs onboarding and payment flows that explain gas, approvals and signatures in plain words.", 55, 18, 4.6, []string{"Figma", "UI design", "Design systems"}},
	{"Hannah Weber", "Backend and indexing engineer", "Subgraphs, event indexers and the APIs on top of them.", 75, 9, 4.8, []string{"Go", "The Graph", "PostgreSQL"}},
}

type demoMilestone struct {
	title  string
	amount int64 // whole USDC
	status string
}

type demoJob struct {
	client      string // "" means the demo client
	freelancer  string // developer name, if hired
	title, desc string
	skills      []string
	status      string
	daysAgo     int
	milestones  []demoMilestone
	applicants  []string // developer names
	messages    [][2]string
}

var demoJobs = []demoJob{
	{
		freelancer: "Lena Kovač",
		title:      "NFT marketplace frontend",
		desc:       "Build the React frontend for our NFT marketplace: browse, list and buy with a connected wallet. Designs are ready in Figma.",
		skills:     []string{"React", "TypeScript", "wagmi"},
		status:     "in_progress",
		daysAgo:    12,
		milestones: []demoMilestone{{"Design system and layout", 600, "released"}, {"Wallet connect and listings", 1200, "submitted"}, {"Checkout and launch", 800, "funded"}},
		applicants: []string{"Lena Kovač", "Diego Álvarez"},
		messages: [][2]string{
			{"", "Welcome aboard! The Figma file is shared with you."},
			{"Lena Kovač", "Thanks, the first milestone is up for review."},
			{"Lena Kovač", "Wallet connect and listings are done. Preview link is in the deliverable."},
		},
	},
	{
		title:      "Audit our staking contract",
		desc:       "We need an independent review of a 400-line staking contract before mainnet. Report with severity levels, then a fix review.",
		skills:     []string{"Solidity", "Audits", "Security"},
		status:     "open",
		daysAgo:    2,
		milestones: []demoMilestone{{"Initial review and report", 1800, "pending"}, {"Fix verification", 1200, "pending"}},
		applicants: []string{"Mei Tanaka", "Aarav Mehta"},
	},
	{
		freelancer: "Diego Álvarez",
		title:      "Escrow payouts dashboard",
		desc:       "Internal dashboard showing every payout, refund and dispute from our escrow contract, with CSV export.",
		skills:     []string{"Go", "React", "PostgreSQL"},
		status:     "completed",
		daysAgo:    30,
		milestones: []demoMilestone{{"API and indexer", 900, "released"}, {"Dashboard UI", 700, "released"}},
		applicants: []string{"Diego Álvarez"},
	},
	{
		client:     "Olivia Park",
		title:      "Token vesting dashboard",
		desc:       "A React dashboard that reads vesting schedules from our contract and lets holders claim unlocked tokens.",
		skills:     []string{"React", "Solidity"},
		status:     "open",
		daysAgo:    1,
		milestones: []demoMilestone{{"Read schedules", 700, "pending"}, {"Claim flow", 1100, "pending"}},
		applicants: []string{"Lena Kovač"},
	},
	{
		client:     "Marcus Lee",
		title:      "Subgraph for DAO voting history",
		desc:       "Index every proposal and vote from our governor contract and expose it through a GraphQL API.",
		skills:     []string{"The Graph", "Go"},
		status:     "open",
		daysAgo:    4,
		milestones: []demoMilestone{{"Subgraph schema and mappings", 800, "pending"}, {"Deploy and docs", 600, "pending"}},
		applicants: []string{"Hannah Weber"},
	},
	{
		client:     "Olivia Park",
		title:      "Mobile wallet onboarding flow",
		desc:       "Design a five-screen onboarding for first-time crypto users: seed phrase, backup and first deposit.",
		skills:     []string{"Figma", "UI design"},
		status:     "open",
		daysAgo:    6,
		milestones: []demoMilestone{{"Wireframes", 400, "pending"}, {"Final designs", 500, "pending"}},
	},
}

func seedDemo(db *DB) error {
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = ?`, DemoEmail).Scan(&n)
	if n > 0 {
		return nil // already seeded
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	hash, _ := bcrypt.GenerateFromPassword([]byte(DemoPassword), bcrypt.DefaultCost)
	clientID, err := insertID(tx, `INSERT INTO users (name, email, password_hash, is_demo) VALUES (?, ?, ?, true)`, "Demo Client", DemoEmail, string(hash))
	if err != nil {
		return fmt.Errorf("demo client: %w", err)
	}

	users := map[string]int64{"": clientID}
	addUser := func(name string) (int64, error) {
		if id, ok := users[name]; ok {
			return id, nil
		}
		id, err := insertID(tx, `INSERT INTO users (name, is_demo) VALUES (?, true)`, name)
		users[name] = id
		return id, err
	}

	devIDs := map[string]int64{}
	for _, d := range demoDevs {
		uid, err := addUser(d.name)
		if err != nil {
			return err
		}
		skills, _ := json.Marshal(d.skills)
		id, err := insertID(tx, `INSERT INTO developers (user_id, name, title, bio, hourly_rate, jobs_done, rating, skills) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			uid, d.name, d.title, d.bio, d.rate, d.jobs, d.rating, string(skills))
		if err != nil {
			return fmt.Errorf("developer %s: %w", d.name, err)
		}
		devIDs[d.name] = id
	}

	now := time.Now()
	for _, j := range demoJobs {
		client, err := addUser(j.client)
		if err != nil {
			return err
		}
		var freelancer any
		if j.freelancer != "" {
			freelancer = users[j.freelancer]
		}
		created := now.AddDate(0, 0, -j.daysAgo)
		skills, _ := json.Marshal(j.skills)
		jobID, err := insertID(tx, `INSERT INTO jobs (client_id, freelancer_id, title, description, skills, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			client, freelancer, j.title, j.desc, string(skills), j.status, created)
		if err != nil {
			return fmt.Errorf("job %s: %w", j.title, err)
		}

		for i, m := range j.milestones {
			var funded, submitted, resolved, deliverable, bps any
			day := func(d int) time.Time { return created.AddDate(0, 0, d) }
			switch m.status {
			case "funded":
				funded = day(i*3 + 2)
			case "submitted":
				funded, submitted = day(i*3+1), now.Add(-20*time.Hour)
				deliverable = "https://github.com/example/demo-delivery"
			case "released":
				funded, submitted, resolved = day(i*3+1), day(i*3+2), day(i*3+3)
				deliverable, bps = "https://github.com/example/demo-delivery", 10000
			}
			if _, err := tx.Exec(`INSERT INTO milestones (job_id, position, title, amount, status, funded_at, submitted_at, resolved_at, deliverable_url, freelancer_bps)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				jobID, i+1, m.title, m.amount*1_000_000, m.status, funded, submitted, resolved, deliverable, bps); err != nil {
				return fmt.Errorf("milestone %s: %w", m.title, err)
			}
		}

		for k, name := range j.applicants {
			status := "pending"
			if j.freelancer != "" {
				status = map[bool]string{true: "accepted", false: "declined"}[name == j.freelancer]
			}
			cover := fmt.Sprintf("Hi! I have shipped similar work before and can start this week. My rate is in my profile; happy to chat first. (%s)", name)
			if _, err := tx.Exec(`INSERT INTO applications (job_id, user_id, cover, status, created_at) VALUES (?, ?, ?, ?, ?)`,
				jobID, users[name], cover, status, created.Add(time.Duration(k+2)*time.Hour)); err != nil {
				return fmt.Errorf("application: %w", err)
			}
		}

		for k, m := range j.messages {
			if _, err := tx.Exec(`INSERT INTO messages (job_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)`,
				jobID, users[m[0]], m[1], created.AddDate(0, 0, k+1)); err != nil {
				return fmt.Errorf("message: %w", err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	log.Printf("demo data seeded: %d developers, %d jobs (log in as %s)", len(demoDevs), len(demoJobs), DemoEmail)
	return nil
}
