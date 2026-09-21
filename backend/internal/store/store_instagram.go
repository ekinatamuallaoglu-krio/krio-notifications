package store

import (
	"database/sql"
	"time"
)

type InstagramProfile struct {
	ProfileID  string
	AccountID  string
	Username   string
	SessionKey string
	Cursor     string
}

func InstagramProfiles(db *sql.DB) []InstagramProfile {
	rows, err := db.Query(`SELECT profile_id,account_id,username,session_key,cursor FROM krio_instagram_profiles ORDER BY username,account_id`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var result []InstagramProfile
	for rows.Next() {
		var p InstagramProfile
		if rows.Scan(&p.ProfileID, &p.AccountID, &p.Username, &p.SessionKey, &p.Cursor) == nil {
			result = append(result, p)
		}
	}
	return result
}

func SaveInstagramProfile(db *sql.DB, profile InstagramProfile) error {
	_, err := db.Exec(`INSERT INTO krio_instagram_profiles(profile_id,account_id,username,session_key,cursor,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(profile_id) DO UPDATE SET account_id=excluded.account_id,username=excluded.username,session_key=excluded.session_key,cursor=excluded.cursor,updated_at=excluded.updated_at`, profile.ProfileID, profile.AccountID, profile.Username, profile.SessionKey, profile.Cursor, time.Now().UnixMilli())
	return err
}

func DeleteInstagramProfile(db *sql.DB, profileID string) error {
	_, err := db.Exec(`DELETE FROM krio_instagram_profiles WHERE profile_id=?`, profileID)
	return err
}
