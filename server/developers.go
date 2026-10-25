package main

import (
	"database/sql"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Developer struct {
	ID         int64    `json:"id"`
	UserID     int64    `json:"userId"`
	Name       string   `json:"name"`
	Title      string   `json:"title"`
	Bio        string   `json:"bio"`
	HourlyRate int      `json:"hourlyRate"`
	JobsDone   int      `json:"jobsDone"`
	Rating     float64  `json:"rating"`
	Skills     []string `json:"skills"`
	Image      *string  `json:"image"`
	Demo       bool     `json:"demo"`
}

const devCols = `id, user_id, name, title, bio, hourly_rate, jobs_done, rating, skills, image,
	COALESCE((SELECT u.is_demo FROM users u WHERE u.id = developers.user_id), false)`

type rowScanner interface{ Scan(...any) error }

func scanDeveloper(r rowScanner) (Developer, error) {
	var d Developer
	var skills string
	err := r.Scan(&d.ID, &d.UserID, &d.Name, &d.Title, &d.Bio, &d.HourlyRate, &d.JobsDone, &d.Rating, &skills, &d.Image, &d.Demo)
	d.Skills = parseSkills(skills)
	return d, err
}

func (s *Server) handleListDevelopers(w http.ResponseWriter, r *http.Request) {
	q := "SELECT " + devCols + " FROM developers"
	var args []any
	var where []string
	if term := strings.TrimSpace(r.URL.Query().Get("q")); term != "" {
		like := "%" + term + "%"
		where = append(where, "(name ILIKE ? OR title ILIKE ? OR bio ILIKE ? OR skills::text ILIKE ?)")
		args = append(args, like, like, like, like)
	}
	if skill := strings.TrimSpace(r.URL.Query().Get("skill")); skill != "" {
		where = append(where, "skills::text ILIKE ?")
		args = append(args, `%"`+skill+`"%`)
	}
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY jobs_done DESC, rating DESC, id DESC LIMIT 100"

	rows, err := s.db.Query(q, args...)
	if err != nil {
		writeErr(w, 500, "could not load developers")
		return
	}
	defer rows.Close()
	out := []Developer{}
	for rows.Next() {
		d, err := scanDeveloper(rows)
		if err != nil {
			writeErr(w, 500, "could not load developers")
			return
		}
		out = append(out, d)
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleGetDeveloper(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	d, err := scanDeveloper(s.db.QueryRow("SELECT "+devCols+" FROM developers WHERE id = ?", id))
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, 404, "developer not found")
		return
	}
	if err != nil {
		writeErr(w, 500, "could not load developer")
		return
	}
	writeJSON(w, 200, d)
}

// saveImage validates and stores an uploaded profile picture, returning its public path.
func (s *Server) saveImage(r *http.Request) (string, error) {
	f, hdr, err := r.FormFile("image")
	if errors.Is(err, http.ErrMissingFile) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	defer f.Close()
	if hdr.Size > 2<<20 {
		return "", errors.New("image must be under 2 MB")
	}
	head := make([]byte, 512)
	n, _ := f.Read(head)
	ext := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}[http.DetectContentType(head[:n])]
	if ext == "" {
		return "", errors.New("image must be JPEG, PNG, WebP or GIF")
	}
	if err := os.MkdirAll(s.cfg.UploadDir, 0o755); err != nil {
		return "", err
	}
	name := randomHex(12) + ext
	out, err := os.Create(filepath.Join(s.cfg.UploadDir, name))
	if err != nil {
		return "", err
	}
	defer out.Close()
	if _, err := out.Write(head[:n]); err != nil {
		return "", err
	}
	if _, err := io.Copy(out, f); err != nil {
		return "", err
	}
	return "/uploads/" + name, nil
}

type profileInput struct {
	name, title, bio string
	rate             int
	skills           string
}

func parseProfile(r *http.Request) (profileInput, string) {
	var p profileInput
	p.name = strings.TrimSpace(r.FormValue("name"))
	p.title = strings.TrimSpace(r.FormValue("title"))
	p.bio = strings.TrimSpace(r.FormValue("bio"))
	p.skills = skillsJSON([]string{r.FormValue("skills")})
	p.rate, _ = strconv.Atoi(r.FormValue("hourlyRate"))
	switch {
	case len(p.name) < 2 || len(p.name) > 80:
		return p, "Name must be 2 to 80 characters"
	case len(p.title) < 2 || len(p.title) > 100:
		return p, "Title must be 2 to 100 characters"
	case p.rate < 1 || p.rate > 10000:
		return p, "Hourly rate must be between 1 and 10,000 USDC"
	case len(p.bio) > 600:
		return p, "Bio must be 600 characters or fewer"
	}
	return p, ""
}

func (s *Server) handleCreateDeveloper(w http.ResponseWriter, r *http.Request, uid int64) {
	r.Body = http.MaxBytesReader(w, r.Body, 3<<20)
	if err := r.ParseMultipartForm(3 << 20); err != nil {
		writeErr(w, 400, "invalid form data")
		return
	}
	p, msg := parseProfile(r)
	if msg != "" {
		writeErr(w, 400, msg)
		return
	}
	img, err := s.saveImage(r)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var imgArg any
	if img != "" {
		imgArg = img
	}
	id, err := insertID(s.db, `INSERT INTO developers (user_id, name, title, bio, hourly_rate, skills, image) VALUES (?,?,?,?,?,?::jsonb,?)`,
		uid, p.name, p.title, p.bio, p.rate, p.skills, imgArg)
	if err != nil {
		if isUnique(err) {
			writeErr(w, 409, "You already have a developer profile")
			return
		}
		writeErr(w, 500, "could not save profile")
		return
	}
	d, _ := scanDeveloper(s.db.QueryRow("SELECT "+devCols+" FROM developers WHERE id = ?", id))
	writeJSON(w, 201, d)
}

func (s *Server) handleUpdateDeveloper(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var owner int64
	if err := s.db.QueryRow(`SELECT user_id FROM developers WHERE id = ?`, id).Scan(&owner); err != nil {
		writeErr(w, 404, "developer not found")
		return
	}
	if owner != uid {
		writeErr(w, 403, "You can only edit your own profile")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 3<<20)
	if err := r.ParseMultipartForm(3 << 20); err != nil {
		writeErr(w, 400, "invalid form data")
		return
	}
	p, msg := parseProfile(r)
	if msg != "" {
		writeErr(w, 400, msg)
		return
	}
	img, err := s.saveImage(r)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	_, err = s.db.Exec(`UPDATE developers SET name=?, title=?, bio=?, hourly_rate=?, skills=?::jsonb, image=COALESCE(NULLIF(?, ''), image) WHERE id=?`,
		p.name, p.title, p.bio, p.rate, p.skills, img, id)
	if err != nil {
		writeErr(w, 500, "could not update profile")
		return
	}
	d, _ := scanDeveloper(s.db.QueryRow("SELECT "+devCols+" FROM developers WHERE id = ?", id))
	writeJSON(w, 200, d)
}

func (s *Server) handleDeleteDeveloper(w http.ResponseWriter, r *http.Request, uid int64) {
	id, err := pathID(r, "id")
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	res, err := s.db.Exec(`DELETE FROM developers WHERE id = ? AND user_id = ?`, id, uid)
	if err != nil {
		writeErr(w, 500, "could not delete profile")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, 404, "profile not found or not yours")
		return
	}
	writeJSON(w, 200, map[string]string{"message": "profile deleted"})
}
