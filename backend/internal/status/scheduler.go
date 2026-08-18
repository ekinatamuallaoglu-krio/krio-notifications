package status

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type Sender func(context.Context, StatusPost) error

func StartScheduler(db *sql.DB, send Sender) {
	_, _ = db.Exec(`UPDATE krio_status_posts SET status='queued' WHERE status='running'`)
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			RunDue(db, send)
		}
	}()
}

func RunDue(db *sql.DB, send Sender) {
	for {
		post, ok, err := ClaimDueStatusPost(db, time.Now())
		if err != nil || !ok {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		err = send(ctx, post)
		cancel()
		if errors.Is(err, ErrDisconnected) {
			_, _ = db.Exec(`UPDATE krio_status_posts SET status='queued',error='' WHERE id=?`, post.ID)
			return
		}
		FinishStatusPost(db, post.ID, err)
	}
}
