package status

import (
	"database/sql"
	"errors"
	"time"

	"krio-chat/backend/internal/app/model"
)

var ErrDisconnected = errors.New("WhatsApp bağlı değil")

type User struct {
	ID   int64
	Role string
}
type StatusPost = model.StatusPost

func CreateStatusPost(db *sql.DB, userID int64, profileID, kind, text, mime, fileName string, media []byte, scheduledAt time.Time) (StatusPost, error) {
	created := time.Now()
	result, err := db.Exec(`INSERT INTO krio_status_posts(user_id,profile_id,kind,text,mime_type,file_name,media,scheduled_at,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,'queued')`, userID, profileID, kind, text, mime, fileName, media, scheduledAt.UnixMilli(), created.UnixMilli())
	if err != nil {
		return StatusPost{}, err
	}
	id, err := result.LastInsertId()
	return StatusPost{ID: id, UserID: userID, ProfileID: profileID, Kind: kind, Text: text, Mime: mime, FileName: fileName, ScheduledAt: scheduledAt, CreatedAt: created, Status: "queued"}, err
}

func StatusPostsForUser(db *sql.DB, user User) ([]StatusPost, error) {
	query := `SELECT id,user_id,profile_id,kind,text,mime_type,file_name,scheduled_at,sent_at,created_at,status,error FROM krio_status_posts`
	args := []any{}
	if user.Role != "admin" {
		query += ` WHERE user_id=?`
		args = append(args, user.ID)
	}
	query += ` ORDER BY scheduled_at DESC,id DESC LIMIT 200`
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []StatusPost{}
	for rows.Next() {
		var item StatusPost
		var scheduled, created int64
		var sent sql.NullInt64
		if err = rows.Scan(&item.ID, &item.UserID, &item.ProfileID, &item.Kind, &item.Text, &item.Mime, &item.FileName, &scheduled, &sent, &created, &item.Status, &item.Error); err != nil {
			return nil, err
		}
		item.ScheduledAt, item.CreatedAt = time.UnixMilli(scheduled), time.UnixMilli(created)
		if sent.Valid {
			value := time.UnixMilli(sent.Int64)
			item.SentAt = &value
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func ClaimDueStatusPost(db *sql.DB, now time.Time) (StatusPost, bool, error) {
	tx, err := db.Begin()
	if err != nil {
		return StatusPost{}, false, err
	}
	defer tx.Rollback()
	var item StatusPost
	var scheduled, created int64
	err = tx.QueryRow(`SELECT id,user_id,profile_id,kind,text,mime_type,file_name,media,scheduled_at,created_at FROM krio_status_posts WHERE status='queued' AND scheduled_at<=? ORDER BY scheduled_at,id LIMIT 1`, now.UnixMilli()).Scan(&item.ID, &item.UserID, &item.ProfileID, &item.Kind, &item.Text, &item.Mime, &item.FileName, &item.Media, &scheduled, &created)
	if err == sql.ErrNoRows {
		return StatusPost{}, false, nil
	}
	if err != nil {
		return StatusPost{}, false, err
	}
	result, err := tx.Exec(`UPDATE krio_status_posts SET status='running',error='' WHERE id=? AND status='queued'`, item.ID)
	if err != nil {
		return StatusPost{}, false, err
	}
	changed, _ := result.RowsAffected()
	if changed != 1 {
		return StatusPost{}, false, nil
	}
	if err = tx.Commit(); err != nil {
		return StatusPost{}, false, err
	}
	item.ScheduledAt, item.CreatedAt, item.Status = time.UnixMilli(scheduled), time.UnixMilli(created), "running"
	return item, true, nil
}

func FinishStatusPost(db *sql.DB, id int64, sendErr error) {
	if sendErr != nil {
		_, _ = db.Exec(`UPDATE krio_status_posts SET status='failed',error=? WHERE id=?`, sendErr.Error(), id)
		return
	}
	_, _ = db.Exec(`UPDATE krio_status_posts SET status='sent',sent_at=?,error='',media=NULL WHERE id=?`, time.Now().UnixMilli(), id)
}

func DeleteQueuedStatusPost(db *sql.DB, id int64, user User) (bool, error) {
	query, args := `DELETE FROM krio_status_posts WHERE id=? AND status='queued'`, []any{id}
	if user.Role != "admin" {
		query += ` AND user_id=?`
		args = append(args, user.ID)
	}
	result, err := db.Exec(query, args...)
	if err != nil {
		return false, err
	}
	count, _ := result.RowsAffected()
	return count == 1, nil
}
