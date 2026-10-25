package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// Demo data for showcases. Every user created here has is_demo = true, so the
// UI can label their profiles and jobs. Only the demo client can log in;
// the other demo users have no password.
//
// Bump demoVersion whenever the data below changes: on the next start the old
// demo rows are removed and the new set is written.

const (
	DemoEmail    = "demo@blockchainfreelance.dev"
	DemoPassword = "demo1234"
	demoVersion  = "2"
)

type demoDev struct {
	name, title, bio string
	rate, jobs       int
	rating           float64
	skills           []string
	github           string
}

var demoDevs = []demoDev{
	{"Aarav Mehta", "Smart contract engineer", "Writes and tests Solidity for escrow, staking and vesting contracts. Foundry-first, gas-aware.", 85, 23, 4.9, []string{"Solidity", "Foundry", "Security"}, "aarav-mehta"},
	{"Lena Kovač", "Frontend engineer for dapps", "Builds wallet-connected React apps with wagmi and viem. Cares about loading and error states.", 70, 31, 4.8, []string{"React", "TypeScript", "wagmi"}, "lenakovac"},
	{"Diego Álvarez", "Full-stack Web3 developer", "Go APIs, Postgres and React frontends that read from the chain and never trust the client.", 65, 12, 4.7, []string{"Go", "React", "PostgreSQL"}, "diego-alvarez"},
	{"Mei Tanaka", "Protocol auditor", "Reviews DeFi protocols line by line and writes findings that a team can actually act on.", 120, 40, 5.0, []string{"Solidity", "Audits", "Formal verification"}, "meitanaka"},
	{"Samuel Okoro", "Product designer, Web3", "Designs onboarding and payment flows that explain gas, approvals and signatures in plain words.", 55, 18, 4.6, []string{"Figma", "UI design", "Design systems"}, "samokoro"},
	{"Hannah Weber", "Backend and indexing engineer", "Subgraphs, event indexers and the APIs on top of them.", 75, 9, 4.8, []string{"Go", "The Graph", "PostgreSQL"}, "hannahweber"},
}

type demoMilestone struct {
	title    string
	amount   int64 // whole USDC
	status   string
	note     string // freelancer's delivery note
	feedback string // client's last change request
}

type demoApp struct {
	dev       string
	cover     string
	bid       int64 // whole USDC, 0 for none
	eta       int
	portfolio string
	resume    bool
	thread    [][2]string // pre-hire messages: sender ("" is the client), body
}

type demoJob struct {
	client      string // "" means the demo client
	freelancer  string // developer name, if hired
	title, desc string
	skills      []string
	status      string
	daysAgo     int
	openDays    int
	openings    int
	duration    string
	level       string
	milestones  []demoMilestone
	applicants  []demoApp
	messages    [][2]string
	review      *Review
}

var demoJobs = []demoJob{
	{
		freelancer: "Lena Kovač",
		title:      "NFT marketplace frontend",
		desc:       "Build the React frontend for our NFT marketplace: browse, list and buy with a connected wallet. Designs are ready in Figma.",
		skills:     []string{"React", "TypeScript", "wagmi"},
		status:     "in_progress", daysAgo: 12, openDays: 10, openings: 1, duration: "1 to 3 months", level: "Intermediate",
		milestones: []demoMilestone{
			{"Design system and layout", 600, "released", "Tokens, typography and the page shells, deployed to the preview.", ""},
			{"Wallet connect and listings", 1200, "submitted", "Connect, network switch and the listing grid with pagination. Preview link is in the deliverable.", ""},
			{"Checkout and launch", 800, "funded", "", "The buy button needs a pending state while the transaction confirms."},
		},
		applicants: []demoApp{
			{dev: "Lena Kovač", cover: "I have shipped three wallet-connected marketplaces with wagmi. I would start with the design system so every page reuses it.", bid: 2500, eta: 30, portfolio: "https://lenakovac.dev", resume: true},
			{dev: "Diego Álvarez", cover: "I can build both the frontend and a small indexer for the listings if you need one later.", bid: 2900, eta: 35},
		},
		messages: [][2]string{
			{"", "Welcome aboard! The Figma file is shared with you."},
			{"Lena Kovač", "Thanks, the first milestone is up for review."},
			{"Lena Kovač", "Wallet connect and listings are done. Preview link is in the deliverable."},
		},
	},
	{
		title:  "Audit our staking contract",
		desc:   "We need an independent review of a 400-line staking contract before mainnet. Report with severity levels, then a fix review.",
		skills: []string{"Solidity", "Audits", "Security"},
		status: "open", daysAgo: 2, openDays: 12, openings: 1, duration: "1 to 4 weeks", level: "Expert",
		milestones: []demoMilestone{{title: "Initial review and report", amount: 1800, status: "pending"}, {title: "Fix verification", amount: 1200, status: "pending"}},
		applicants: []demoApp{
			{dev: "Mei Tanaka", cover: "I audit staking and reward logic for a living. I will send a draft report within a week and verify every fix.", bid: 3000, eta: 10, portfolio: "https://meitanaka.xyz/audits", resume: true,
				thread: [][2]string{{"", "Have you reviewed contracts with reward-per-share accounting before?"}, {"Mei Tanaka", "Yes, five in the last year. Two of the reports are public on my portfolio."}}},
			{dev: "Aarav Mehta", cover: "I write staking contracts myself, so I know where the rounding and reentrancy bugs hide. Happy to start Monday.", bid: 2600, eta: 14},
		},
	},
	{
		freelancer: "Diego Álvarez",
		title:      "Escrow payouts dashboard",
		desc:       "Internal dashboard showing every payout, refund and dispute from our escrow contract, with CSV export.",
		skills:     []string{"Go", "React", "PostgreSQL"},
		status:     "completed", daysAgo: 30, openDays: 7, openings: 1, duration: "1 to 4 weeks", level: "Intermediate",
		milestones: []demoMilestone{{"API and indexer", 900, "released", "Indexer backfills from block 0 and follows new events.", ""}, {"Dashboard UI", 700, "released", "Filters, totals and CSV export.", ""}},
		applicants: []demoApp{{dev: "Diego Álvarez", cover: "I have built two event indexers in Go for escrow contracts. The dashboard is a week of work on top.", bid: 1600, eta: 21}},
		review:     &Review{Rating: 5, Comment: "Clear updates every few days and the indexer has not missed an event since."},
	},
	{
		client: "Olivia Park",
		title:  "Token vesting dashboard",
		desc:   "A React dashboard that reads vesting schedules from our contract and lets holders claim unlocked tokens.",
		skills: []string{"React", "Solidity"},
		status: "open", daysAgo: 1, openDays: 14, openings: 1, duration: "1 to 4 weeks", level: "Intermediate",
		milestones: []demoMilestone{{title: "Read schedules", amount: 700, status: "pending"}, {title: "Claim flow", amount: 1100, status: "pending"}},
		applicants: []demoApp{{dev: "Lena Kovač", cover: "Vesting UIs are mostly about explaining the cliff clearly. I have a component for exactly that.", bid: 1800, eta: 18}},
	},
	{
		client: "Marcus Lee",
		title:  "Subgraph for DAO voting history",
		desc:   "Index every proposal and vote from our governor contract and expose it through a GraphQL API.",
		skills: []string{"The Graph", "Go"},
		status: "open", daysAgo: 4, openDays: 10, openings: 1, duration: "Less than a week", level: "Intermediate",
		milestones: []demoMilestone{{title: "Subgraph schema and mappings", amount: 800, status: "pending"}, {title: "Deploy and docs", amount: 600, status: "pending"}},
		applicants: []demoApp{{dev: "Hannah Weber", cover: "I maintain subgraphs for two governor deployments. Mappings and docs in five days.", bid: 1400, eta: 5}},
	},
	{
		client: "Olivia Park",
		title:  "Mobile wallet onboarding flow",
		desc:   "Design a five-screen onboarding for first-time crypto users: seed phrase, backup and first deposit. We are hiring two designers to explore different directions.",
		skills: []string{"Figma", "UI design"},
		status: "open", daysAgo: 6, openDays: 21, openings: 2, duration: "Less than a week", level: "Entry",
		milestones: []demoMilestone{{title: "Wireframes", amount: 400, status: "pending"}, {title: "Final designs", amount: 500, status: "pending"}},
		applicants: []demoApp{{dev: "Samuel Okoro", cover: "Onboarding is where most wallets lose people. I would test the seed phrase screen with five new users first.", bid: 900, eta: 7, portfolio: "https://dribbble.com/samokoro"}},
	},
}

func seedDemo(db *DB) error {
	db.Exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
	var version string
	db.QueryRow(`SELECT value FROM meta WHERE key = 'demo_version'`).Scan(&version)
	if version == demoVersion {
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := clearDemo(tx); err != nil {
		return fmt.Errorf("clear old demo data: %w", err)
	}

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

	github := map[string]string{}
	for _, d := range demoDevs {
		uid, err := addUser(d.name)
		if err != nil {
			return err
		}
		skills, _ := json.Marshal(d.skills)
		if _, err := tx.Exec(`INSERT INTO developers (user_id, name, title, bio, hourly_rate, jobs_done, rating, skills) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			uid, d.name, d.title, d.bio, d.rate, d.jobs, d.rating, string(skills)); err != nil {
			return fmt.Errorf("developer %s: %w", d.name, err)
		}
		github[d.name] = "https://github.com/" + d.github
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
		at := func(days int, hours int) time.Time {
			return created.AddDate(0, 0, days).Add(time.Duration(hours) * time.Hour)
		}
		skills, _ := json.Marshal(j.skills)
		jobID, err := insertID(tx, `INSERT INTO jobs (client_id, freelancer_id, title, description, skills, status, created_at, openings, closes_at, duration, level)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			client, freelancer, j.title, j.desc, string(skills), j.status, created, j.openings, created.AddDate(0, 0, j.openDays), j.duration, j.level)
		if err != nil {
			return fmt.Errorf("job %s: %w", j.title, err)
		}
		event := func(t time.Time, actor int64, kind, detail string) {
			var a any
			if actor != 0 {
				a = actor
			}
			tx.Exec(`INSERT INTO job_events (job_id, actor_id, kind, detail, created_at) VALUES (?, ?, ?, ?, ?)`, jobID, a, kind, detail, t)
		}
		event(created, client, "posted", "")

		for k, a := range j.applicants {
			status := "pending"
			if j.freelancer != "" {
				status = map[bool]string{true: "accepted", false: "declined"}[a.dev == j.freelancer]
			} else if k == 0 && len(a.thread) > 0 {
				status = "shortlisted"
			}
			var resume, bid, eta any
			if a.resume {
				pdf := demoPDF(a.dev, a.dev+" - "+devTitle(a.dev), "Selected work", "  "+github[a.dev], "  "+a.portfolio, "", a.cover)
				fid, err := insertID(tx, `INSERT INTO files (owner_id, kind, mime, name, data) VALUES (?, 'resume', 'application/pdf', ?, ?)`,
					users[a.dev], strings.ToLower(strings.ReplaceAll(ascii(a.dev), " ", "-"))+"-cv.pdf", pdf)
				if err != nil {
					return fmt.Errorf("resume: %w", err)
				}
				resume = fid
			}
			if a.bid > 0 {
				bid = a.bid * 1_000_000
			}
			if a.eta > 0 {
				eta = a.eta
			}
			appID, err := insertID(tx, `INSERT INTO applications (job_id, user_id, cover, status, created_at, github_url, portfolio_url, bid, eta_days, resume_file_id)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				jobID, users[a.dev], a.cover, status, at(0, k+2), github[a.dev], a.portfolio, bid, eta, resume)
			if err != nil {
				return fmt.Errorf("application: %w", err)
			}
			event(at(0, k+2), users[a.dev], "applied", a.dev)
			for n, m := range a.thread {
				if _, err := tx.Exec(`INSERT INTO messages (job_id, sender_id, body, created_at, application_id) VALUES (?, ?, ?, ?, ?)`,
					jobID, users[m[0]], m[1], at(1, n), appID); err != nil {
					return fmt.Errorf("thread: %w", err)
				}
			}
		}
		if j.freelancer != "" {
			event(at(1, 0), client, "hired", j.freelancer)
		}

		for i, m := range j.milestones {
			var funded, submitted, resolved, deliverable, bps any
			day := func(d int) time.Time { return at(d, 0) }
			revisions := 0
			if m.feedback != "" {
				revisions = 1
			}
			switch m.status {
			case "funded":
				funded = day(i*3 + 2)
				event(day(i*3+2), client, "funded", m.title)
				if m.feedback != "" {
					event(day(i*3+3), client, "changes_requested", m.title+": "+m.feedback)
				}
			case "submitted":
				funded, submitted = day(i*3+1), now.Add(-20*time.Hour)
				deliverable = "https://github.com/example/demo-delivery"
				event(day(i*3+1), client, "funded", m.title)
				event(now.Add(-20*time.Hour), users[j.freelancer], "submitted", m.title)
			case "released":
				funded, submitted, resolved = day(i*3+1), day(i*3+2), day(i*3+3)
				deliverable, bps = "https://github.com/example/demo-delivery", 10000
				event(day(i*3+1), client, "funded", m.title)
				event(day(i*3+2), users[j.freelancer], "submitted", m.title)
				event(day(i*3+3), client, "approved", m.title)
			}
			if _, err := tx.Exec(`INSERT INTO milestones (job_id, position, title, amount, status, funded_at, submitted_at, resolved_at, deliverable_url, freelancer_bps, submission_note, feedback, revisions)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				jobID, i+1, m.title, m.amount*1_000_000, m.status, funded, submitted, resolved, deliverable, bps, m.note, m.feedback, revisions); err != nil {
				return fmt.Errorf("milestone %s: %w", m.title, err)
			}
		}

		for k, m := range j.messages {
			if _, err := tx.Exec(`INSERT INTO messages (job_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)`,
				jobID, users[m[0]], m[1], at(k+1, 0)); err != nil {
				return fmt.Errorf("message: %w", err)
			}
		}
		if j.status == "completed" {
			event(at(len(j.milestones)*3+1, 0), 0, "completed", "")
		}
		if j.review != nil {
			if _, err := tx.Exec(`INSERT INTO reviews (job_id, reviewer_id, freelancer_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
				jobID, client, users[j.freelancer], j.review.Rating, j.review.Comment, at(len(j.milestones)*3+1, 2)); err != nil {
				return fmt.Errorf("review: %w", err)
			}
			event(at(len(j.milestones)*3+1, 2), client, "reviewed", fmt.Sprintf("%d stars", j.review.Rating))
		}
	}

	if _, err := tx.Exec(`INSERT INTO meta (key, value) VALUES ('demo_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, demoVersion); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	log.Printf("demo data v%s seeded: %d developers, %d jobs (log in as %s)", demoVersion, len(demoDevs), len(demoJobs), DemoEmail)
	return nil
}

// clearDemo removes every row that belongs to or mentions a demo user.
func clearDemo(tx *Tx) error {
	const demo = `(SELECT id FROM users WHERE is_demo)`
	const demoJobs = `(SELECT id FROM jobs WHERE client_id IN ` + demo + ` OR freelancer_id IN ` + demo + `)`
	for _, q := range []string{
		`DELETE FROM jobs WHERE parent_id IN ` + demoJobs,
		`DELETE FROM jobs WHERE id IN ` + demoJobs,
		`DELETE FROM reviews WHERE reviewer_id IN ` + demo + ` OR freelancer_id IN ` + demo,
		`DELETE FROM messages WHERE sender_id IN ` + demo,
		`DELETE FROM applications WHERE user_id IN ` + demo,
		`UPDATE job_events SET actor_id = NULL WHERE actor_id IN ` + demo,
		`DELETE FROM users WHERE is_demo`,
	} {
		if _, err := tx.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

func devTitle(name string) string {
	for _, d := range demoDevs {
		if d.name == name {
			return d.title
		}
	}
	return ""
}

// demoPDF builds a one-page PDF with the given lines, enough for a browser to display.
func demoPDF(title string, lines ...string) []byte {
	esc := strings.NewReplacer(`\`, `\\`, "(", `\(`, ")", `\)`)
	var text bytes.Buffer
	fmt.Fprintf(&text, "BT /F1 22 Tf 60 760 Td (%s) Tj ET\n", esc.Replace(ascii(title)))
	y := 725
	for _, l := range lines {
		for _, part := range wrap(ascii(l), 80) {
			fmt.Fprintf(&text, "BT /F1 11 Tf 60 %d Td (%s) Tj ET\n", y, esc.Replace(part))
			y -= 16
		}
	}
	objs := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", text.Len(), text.String()),
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	}
	var b bytes.Buffer
	b.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objs))
	for i, o := range objs {
		offsets[i] = b.Len()
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, o)
	}
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(objs)+1)
	for _, off := range offsets {
		fmt.Fprintf(&b, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&b, "trailer << /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objs)+1, xref)
	return b.Bytes()
}

// ascii keeps the built-in PDF font happy: it has no glyphs outside Latin-1.
func ascii(s string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r < 128:
			return r
		case strings.ContainsRune("áàâä", r):
			return 'a'
		case r == 'Á':
			return 'A'
		case strings.ContainsRune("éèêë", r):
			return 'e'
		case r == 'č' || r == 'ć':
			return 'c'
		}
		return '-'
	}, s)
}

func wrap(s string, width int) []string {
	var out []string
	for len(s) > width {
		cut := strings.LastIndex(s[:width], " ")
		if cut <= 0 {
			cut = width
		}
		out = append(out, s[:cut])
		s = strings.TrimSpace(s[cut:])
	}
	return append(out, s)
}
