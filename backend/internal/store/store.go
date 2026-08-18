package store

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

func OpenAppStore(database string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", "file:"+database+"?_foreign_keys=on&_busy_timeout=5000")
	if err != nil {
		return nil, err
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS krio_chats (
		profile_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, last_text TEXT NOT NULL, updated_at INTEGER NOT NULL, unread_count INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY(profile_id, id));
		CREATE TABLE IF NOT EXISTS krio_messages (
			profile_id TEXT NOT NULL, id TEXT NOT NULL, chat_id TEXT NOT NULL, sender_name TEXT NOT NULL, text TEXT NOT NULL,
			outgoing INTEGER NOT NULL, created_at INTEGER NOT NULL, sender_id TEXT NOT NULL DEFAULT '', reply_to_id TEXT NOT NULL DEFAULT '',
			reply_text TEXT NOT NULL DEFAULT '', reaction TEXT NOT NULL DEFAULT '', forwarded INTEGER NOT NULL DEFAULT 0,
			message_type TEXT NOT NULL DEFAULT 'text', mime_type TEXT NOT NULL DEFAULT '', file_name TEXT NOT NULL DEFAULT '', file_size INTEGER NOT NULL DEFAULT 0,
			latitude REAL NOT NULL DEFAULT 0, longitude REAL NOT NULL DEFAULT 0, metadata TEXT NOT NULL DEFAULT '', raw_message BLOB, status TEXT NOT NULL DEFAULT '', PRIMARY KEY(profile_id, id));
		CREATE TABLE IF NOT EXISTS krio_profile_names (profile_id TEXT PRIMARY KEY, nickname TEXT NOT NULL, sound TEXT NOT NULL DEFAULT 'chime', volume INTEGER NOT NULL DEFAULT 70, typing_min_ms INTEGER NOT NULL DEFAULT 100, typing_max_ms INTEGER NOT NULL DEFAULT 200, delay_min_ms INTEGER NOT NULL DEFAULT 1000, delay_max_ms INTEGER NOT NULL DEFAULT 5000, work_enabled INTEGER NOT NULL DEFAULT 0, work_days TEXT NOT NULL DEFAULT '1,2,3,4,5', work_start TEXT NOT NULL DEFAULT '09:00', work_end TEXT NOT NULL DEFAULT '18:00');`)
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS krio_bulk_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, body TEXT NOT NULL)`)
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS krio_bulk_operations (
		id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL, template_id INTEGER NOT NULL, template_name TEXT NOT NULL, template_body TEXT NOT NULL,
		mode TEXT NOT NULL, started_at INTEGER NOT NULL, completed_at INTEGER, status TEXT NOT NULL, total INTEGER NOT NULL, success INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE IF NOT EXISTS krio_bulk_operation_items (
		id INTEGER PRIMARY KEY AUTOINCREMENT, operation_id INTEGER NOT NULL REFERENCES krio_bulk_operations(id) ON DELETE CASCADE, row_number INTEGER NOT NULL,
		recipient TEXT NOT NULL, message TEXT NOT NULL, values_json TEXT NOT NULL, status TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', sent_at INTEGER NOT NULL);`)
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS krio_status_posts (
		id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 0, profile_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
		mime_type TEXT NOT NULL DEFAULT '', file_name TEXT NOT NULL DEFAULT '', media BLOB, scheduled_at INTEGER NOT NULL, sent_at INTEGER,
		created_at INTEGER NOT NULL, status TEXT NOT NULL, error TEXT NOT NULL DEFAULT '');
		CREATE INDEX IF NOT EXISTS krio_status_posts_due ON krio_status_posts(status,scheduled_at);`)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("uygulama veritabanı hazırlanamadı: %w", err)
	}
	if err = InitAccessStore(db); err != nil {
		db.Close()
		return nil, err
	}
	if err = MigrateAppStore(db); err != nil {
		db.Close()
		return nil, err
	}
	for _, statement := range []string{
		`ALTER TABLE krio_messages ADD COLUMN sender_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE krio_messages ADD COLUMN reply_to_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE krio_messages ADD COLUMN reply_text TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE krio_messages ADD COLUMN reaction TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE krio_messages ADD COLUMN forwarded INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE krio_chats ADD COLUMN unread_count INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE krio_profile_names ADD COLUMN sound TEXT NOT NULL DEFAULT 'chime'`,
		`ALTER TABLE krio_profile_names ADD COLUMN volume INTEGER NOT NULL DEFAULT 70`,
		`ALTER TABLE krio_profile_names ADD COLUMN typing_min_ms INTEGER NOT NULL DEFAULT 100`,
		`ALTER TABLE krio_profile_names ADD COLUMN typing_max_ms INTEGER NOT NULL DEFAULT 200`,
		`ALTER TABLE krio_profile_names ADD COLUMN delay_min_ms INTEGER NOT NULL DEFAULT 1000`,
		`ALTER TABLE krio_profile_names ADD COLUMN delay_max_ms INTEGER NOT NULL DEFAULT 5000`,
		`ALTER TABLE krio_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text'`,
		`ALTER TABLE krio_messages ADD COLUMN mime_type TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE krio_messages ADD COLUMN file_name TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE krio_messages ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE krio_messages ADD COLUMN latitude REAL NOT NULL DEFAULT 0`,
		`ALTER TABLE krio_messages ADD COLUMN longitude REAL NOT NULL DEFAULT 0`,
		`ALTER TABLE krio_messages ADD COLUMN metadata TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE krio_messages ADD COLUMN raw_message BLOB`,
		`ALTER TABLE krio_messages ADD COLUMN status TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE krio_bulk_operations ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE krio_profile_names ADD COLUMN work_enabled INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE krio_profile_names ADD COLUMN work_days TEXT NOT NULL DEFAULT '1,2,3,4,5'`,
		`ALTER TABLE krio_profile_names ADD COLUMN work_start TEXT NOT NULL DEFAULT '09:00'`,
		`ALTER TABLE krio_profile_names ADD COLUMN work_end TEXT NOT NULL DEFAULT '18:00'`,
	} {
		_, _ = db.Exec(statement)
	}
	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS krio_messages_chat_time ON krio_messages(profile_id, chat_id, created_at);
		DELETE FROM krio_messages WHERE chat_id='status@broadcast';
		DELETE FROM krio_chats WHERE id='status@broadcast'`)
	return db, err
}

func BoolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func MigrateAppStore(db *sql.DB) error {
	var profileColumn int
	rows, err := db.Query(`PRAGMA table_info(krio_chats)`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var cid, notnull, pk int
		var name, kind string
		var defaultValue any
		if rows.Scan(&cid, &name, &kind, &notnull, &defaultValue, &pk) == nil && name == "profile_id" {
			profileColumn++
		}
	}
	rows.Close()
	if profileColumn > 0 {
		return nil
	}
	_, err = db.Exec(`ALTER TABLE krio_chats RENAME TO krio_chats_legacy;
		ALTER TABLE krio_messages RENAME TO krio_messages_legacy;
		CREATE TABLE krio_chats (profile_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, last_text TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(profile_id,id));
		CREATE TABLE krio_messages (profile_id TEXT NOT NULL, id TEXT NOT NULL, chat_id TEXT NOT NULL, sender_name TEXT NOT NULL, text TEXT NOT NULL, outgoing INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(profile_id,id));
		INSERT INTO krio_chats SELECT 'legacy', id, name, last_text, updated_at FROM krio_chats_legacy;
		INSERT INTO krio_messages SELECT 'legacy', id, chat_id, sender_name, text, outgoing, created_at FROM krio_messages_legacy;
		DROP TABLE krio_chats_legacy; DROP TABLE krio_messages_legacy;`)
	return err
}

func ClaimLegacyData(db *sql.DB, profileID string) error {
	_, err := db.Exec(`UPDATE krio_chats SET profile_id=? WHERE profile_id='legacy'; UPDATE krio_messages SET profile_id=? WHERE profile_id='legacy'`, profileID, profileID)
	return err
}

func HistoryAnchors(db *sql.DB, profileID string) ([]HistoryAnchor, error) {
	rows, err := db.Query(`SELECT id,chat_id,outgoing,created_at FROM krio_messages m WHERE profile_id=? AND NOT EXISTS (SELECT 1 FROM krio_messages older WHERE older.profile_id=m.profile_id AND older.chat_id=m.chat_id AND (older.created_at<m.created_at OR (older.created_at=m.created_at AND older.id<m.id)))`, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []HistoryAnchor{}
	for rows.Next() {
		var item HistoryAnchor
		var outgoing int
		var created int64
		if err = rows.Scan(&item.ID, &item.ChatID, &outgoing, &created); err != nil {
			return nil, err
		}
		item.Outgoing = outgoing != 0
		item.CreatedAt = time.UnixMilli(created)
		result = append(result, item)
	}
	return result, rows.Err()
}
