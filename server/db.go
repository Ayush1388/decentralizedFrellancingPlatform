package main

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const schema = `
CREATE TABLE IF NOT EXISTS users (
	id             BIGSERIAL PRIMARY KEY,
	name           TEXT NOT NULL,
	email          TEXT UNIQUE,
	password_hash  TEXT,
	google_id      TEXT UNIQUE,
	wallet_address TEXT UNIQUE,
	created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_nonces (
	address    TEXT PRIMARY KEY,
	nonce      TEXT NOT NULL,
	expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS developers (
	id          BIGSERIAL PRIMARY KEY,
	user_id     BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
	name        TEXT NOT NULL,
	title       TEXT NOT NULL,
	bio         TEXT NOT NULL DEFAULT '',
	hourly_rate INTEGER NOT NULL CHECK (hourly_rate > 0),
	jobs_done   INTEGER NOT NULL DEFAULT 0,
	rating      DOUBLE PRECISION NOT NULL DEFAULT 0,
	skills      JSONB NOT NULL DEFAULT '[]',
	image       TEXT,
	created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
	id            BIGSERIAL PRIMARY KEY,
	client_id     BIGINT NOT NULL REFERENCES users(id),
	freelancer_id BIGINT REFERENCES users(id),
	title         TEXT NOT NULL,
	description   TEXT NOT NULL,
	skills        JSONB NOT NULL DEFAULT '[]',
	status        TEXT NOT NULL DEFAULT 'open'
	              CHECK (status IN ('open','in_progress','completed','cancelled')),
	created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- amounts are USDC base units (6 decimals), matching the token on-chain
CREATE TABLE IF NOT EXISTS milestones (
	id              BIGSERIAL PRIMARY KEY,
	job_id          BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
	position        INTEGER NOT NULL,
	title           TEXT NOT NULL,
	amount          BIGINT NOT NULL CHECK (amount > 0),
	status          TEXT NOT NULL DEFAULT 'pending'
	                CHECK (status IN ('pending','funded','submitted','released','refunded','disputed','resolved')),
	deliverable_url TEXT,
	fund_tx         TEXT,
	release_tx      TEXT,
	funded_at       TIMESTAMPTZ,
	submitted_at    TIMESTAMPTZ,
	resolved_at     TIMESTAMPTZ,
	freelancer_bps  INTEGER CHECK (freelancer_bps BETWEEN 0 AND 10000),
	UNIQUE (job_id, position)
);

CREATE TABLE IF NOT EXISTS applications (
	id         BIGSERIAL PRIMARY KEY,
	job_id     BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
	user_id    BIGINT NOT NULL REFERENCES users(id),
	cover      TEXT NOT NULL,
	status     TEXT NOT NULL DEFAULT 'pending',
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (job_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
	id         BIGSERIAL PRIMARY KEY,
	job_id     BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
	sender_id  BIGINT NOT NULL REFERENCES users(id),
	body       TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS escrow_id BIGINT;
-- demo rows are seeded for showcases and labelled as such in the UI
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Uploaded files live in the database: the host's disk is wiped on every deploy.
CREATE TABLE IF NOT EXISTS files (
	id         BIGSERIAL PRIMARY KEY,
	owner_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind       TEXT NOT NULL CHECK (kind IN ('avatar','resume')),
	mime       TEXT NOT NULL,
	name       TEXT NOT NULL DEFAULT '',
	data       BYTEA NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A posting can have several openings; with more than one, each hire becomes its own contract (a child job).
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS openings INTEGER NOT NULL DEFAULT 1;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS duration TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES jobs(id);
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('open','filled','in_progress','completed','cancelled'));

ALTER TABLE applications ADD COLUMN IF NOT EXISTS github_url TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS portfolio_url TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS bid BIGINT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS eta_days INTEGER;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_file_id BIGINT REFERENCES files(id) ON DELETE SET NULL;

ALTER TABLE milestones ADD COLUMN IF NOT EXISTS submission_note TEXT NOT NULL DEFAULT '';
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS feedback TEXT NOT NULL DEFAULT '';
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS dispute_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS revisions INTEGER NOT NULL DEFAULT 0;

-- Messages with an application_id are the pre-hire thread between a client and one applicant.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS application_id BIGINT REFERENCES applications(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS job_events (
	id         BIGSERIAL PRIMARY KEY,
	job_id     BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
	actor_id   BIGINT REFERENCES users(id),
	kind       TEXT NOT NULL,
	detail     TEXT NOT NULL DEFAULT '',
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
	id            BIGSERIAL PRIMARY KEY,
	job_id        BIGINT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
	reviewer_id   BIGINT NOT NULL REFERENCES users(id),
	freelancer_id BIGINT NOT NULL REFERENCES users(id),
	rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
	comment       TEXT NOT NULL DEFAULT '',
	created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_app ON messages(application_id, id);
CREATE INDEX IF NOT EXISTS idx_jobs_parent ON jobs(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_escrow ON jobs(escrow_id) WHERE escrow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_milestones_job ON milestones(job_id);
CREATE INDEX IF NOT EXISTS idx_messages_job ON messages(job_id, id);
CREATE INDEX IF NOT EXISTS idx_apps_job ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_apps_user ON applications(user_id);
`

// DB wraps *sql.DB so handlers can keep writing `?` placeholders; they are
// rewritten to Postgres' $1, $2, ... before the query is sent.
type DB struct{ *sql.DB }

type Tx struct{ *sql.Tx }

func rebind(q string) string {
	if !strings.Contains(q, "?") {
		return q
	}
	var b strings.Builder
	n := 0
	for _, r := range q {
		if r == '?' {
			n++
			b.WriteString("$" + strconv.Itoa(n))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func (d *DB) Exec(q string, a ...any) (sql.Result, error) { return d.DB.Exec(rebind(q), a...) }
func (d *DB) Query(q string, a ...any) (*sql.Rows, error) { return d.DB.Query(rebind(q), a...) }
func (d *DB) QueryRow(q string, a ...any) *sql.Row        { return d.DB.QueryRow(rebind(q), a...) }
func (d *DB) Begin() (*Tx, error) {
	tx, err := d.DB.Begin()
	return &Tx{tx}, err
}

func (t *Tx) Exec(q string, a ...any) (sql.Result, error) { return t.Tx.Exec(rebind(q), a...) }
func (t *Tx) Query(q string, a ...any) (*sql.Rows, error) { return t.Tx.Query(rebind(q), a...) }
func (t *Tx) QueryRow(q string, a ...any) *sql.Row        { return t.Tx.QueryRow(rebind(q), a...) }

// insertID runs an INSERT ... RETURNING id.
func insertID(q interface {
	QueryRow(string, ...any) *sql.Row
}, query string, args ...any) (int64, error) {
	var id int64
	err := q.QueryRow(query+" RETURNING id", args...).Scan(&id)
	return id, err
}

// isUnique reports whether err is a Postgres unique-constraint violation.
func isUnique(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

func openDB(url string) (*DB, error) {
	sdb, err := sql.Open("pgx", url)
	if err != nil {
		return nil, err
	}
	sdb.SetMaxOpenConns(20)
	sdb.SetConnMaxLifetime(30 * time.Minute)

	// The container may still be starting; retry briefly before giving up.
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	for {
		if err = sdb.PingContext(ctx); err == nil {
			break
		}
		select {
		case <-ctx.Done():
			return nil, errors.New("cannot reach Postgres (is `docker compose up -d` running?): " + err.Error())
		case <-time.After(750 * time.Millisecond):
		}
	}
	if _, err := sdb.Exec(schema); err != nil {
		return nil, err
	}
	return &DB{sdb}, nil
}
