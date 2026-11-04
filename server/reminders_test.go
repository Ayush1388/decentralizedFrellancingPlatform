package main

import (
	"fmt"
	"testing"
)

func (e *env_) notificationKinds(uid int64) map[string]int {
	rows, _ := e.srv.db.Query(`SELECT kind, COUNT(*) FROM notifications WHERE user_id = ? GROUP BY kind`, uid)
	out := map[string]int{}
	for rows.Next() {
		var k string
		var n int
		rows.Scan(&k, &n)
		out[k] = n
	}
	rows.Close()
	return out
}

func TestRemindersAreSentOnceAtTheRightTime(t *testing.T) {
	e := newEnv(t)
	client, dev, _, jobID, ms := e.hiredPair() // client is user 1, dev is user 2
	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", ms[0]), client, nil)
	e.call("POST", fmt.Sprintf("/api/milestones/%d/submit", ms[0]), dev, map[string]string{"deliverableUrl": "https://github.com/d/w"})
	e.call("POST", fmt.Sprintf("/api/milestones/%d/fund", ms[1]), client, nil)

	// Nothing is close to a deadline yet.
	e.srv.sendReminders()
	if got := e.notificationKinds(1)["reminder"] + e.notificationKinds(2)["reminder"]; got != 0 {
		t.Fatalf("early reminders: %d", got)
	}

	// The client's review window ends in a day and the freelancer's delivery window ends in a day.
	e.srv.db.Exec(`UPDATE milestones SET submitted_at = now() - interval '6 days' WHERE id = ?`, ms[0])
	e.srv.db.Exec(`UPDATE milestones SET funded_at = now() - interval '13 days' WHERE id = ?`, ms[1])
	e.srv.sendReminders()
	e.srv.sendReminders() // running again must not repeat them
	if e.notificationKinds(1)["reminder"] != 1 || e.notificationKinds(2)["reminder"] != 1 {
		t.Fatalf("warnings: client %v freelancer %v", e.notificationKinds(1), e.notificationKinds(2))
	}

	// Past the deadlines the other side hears that they may now act.
	e.srv.db.Exec(`UPDATE milestones SET submitted_at = now() - interval '8 days' WHERE id = ?`, ms[0])
	e.srv.db.Exec(`UPDATE milestones SET funded_at = now() - interval '15 days' WHERE id = ?`, ms[1])
	e.srv.sendReminders()
	e.srv.sendReminders()
	if e.notificationKinds(1)["reminder"] != 2 || e.notificationKinds(2)["reminder"] != 2 {
		t.Fatalf("after the deadlines: client %v freelancer %v", e.notificationKinds(1), e.notificationKinds(2))
	}
	_ = jobID
}

func TestPostingDeadlineReminderAndEditNotice(t *testing.T) {
	e := newEnv(t)
	client, _ := e.signup("Client", "c@x.io")
	dev, _ := e.signup("Dev", "d@x.io")
	jobID, _ := e.postJob(client, nil)
	e.apply(jobID, dev)

	// An applicant is told when the posting they applied to changes.
	code, out := e.call("PUT", fmt.Sprintf("/api/jobs/%d", jobID), client, map[string]any{
		"title": "Build an escrow UI v2", "description": "A detailed description that is long enough.",
		"milestones": []map[string]any{{"title": "Design", "amount": 100}, {"title": "Build", "amount": 200}}})
	e.mustOK(code, out, 200)
	e.srv.sendPending()
	if e.notificationKinds(2)["edited"] != 1 {
		t.Fatalf("applicant notifications: %v", e.notificationKinds(2))
	}

	// Closing tomorrow with someone waiting: the client is nudged; once it closes, they are told it ended.
	e.srv.db.Exec(`UPDATE jobs SET closes_at = now() + interval '20 hours' WHERE id = ?`, jobID)
	e.srv.sendReminders()
	e.srv.sendReminders()
	if e.notificationKinds(1)["reminder"] != 1 {
		t.Fatalf("closing-soon reminder: %v", e.notificationKinds(1))
	}
	e.srv.db.Exec(`UPDATE jobs SET closes_at = now() - interval '1 hour' WHERE id = ?`, jobID)
	e.srv.sendReminders()
	if e.notificationKinds(1)["reminder"] != 2 {
		t.Fatalf("expired reminder: %v", e.notificationKinds(1))
	}
}
