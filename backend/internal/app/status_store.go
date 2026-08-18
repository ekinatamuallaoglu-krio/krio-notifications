package app

import (
	"database/sql"
	"time"

	"krio-chat/backend/internal/status"
)

func createStatusPost(db *sql.DB, userID int64, profileID, kind, text, mime, fileName string, media []byte, scheduledAt time.Time) (StatusPost, error) {
	return status.CreateStatusPost(db, userID, profileID, kind, text, mime, fileName, media, scheduledAt)
}
func statusPostsForUser(db *sql.DB, user appUser) ([]StatusPost, error) {
	return status.StatusPostsForUser(db, status.User{ID: user.ID, Role: user.Role})
}
func claimDueStatusPost(db *sql.DB, now time.Time) (StatusPost, bool, error) {
	return status.ClaimDueStatusPost(db, now)
}
func finishStatusPost(db *sql.DB, id int64, err error) { status.FinishStatusPost(db, id, err) }
func deleteQueuedStatusPost(db *sql.DB, id int64, user appUser) (bool, error) {
	return status.DeleteQueuedStatusPost(db, id, status.User{ID: user.ID, Role: user.Role})
}
