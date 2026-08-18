package app

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type appUser struct {
	ID          int64    `json:"id"`
	Username    string   `json:"username"`
	Role        string   `json:"role"`
	ProfileIDs  []string `json:"profileIds"`
	TemplateIDs []int64  `json:"templateIds"`
}

type userContextKey struct{}

var usernamePattern = regexp.MustCompile(`^[\pL\pN._@-]{3,50}$`)

func initAccessStore(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS krio_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS krio_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','user')), created_at INTEGER NOT NULL);
		CREATE TABLE IF NOT EXISTS krio_sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES krio_users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
		CREATE TABLE IF NOT EXISTS krio_user_profile_access (user_id INTEGER NOT NULL REFERENCES krio_users(id) ON DELETE CASCADE, profile_id TEXT NOT NULL, PRIMARY KEY(user_id,profile_id));
		CREATE TABLE IF NOT EXISTS krio_user_template_access (user_id INTEGER NOT NULL REFERENCES krio_users(id) ON DELETE CASCADE, template_id INTEGER NOT NULL REFERENCES krio_bulk_templates(id) ON DELETE CASCADE, PRIMARY KEY(user_id,template_id));`)
	return err
}

func validateUserInput(username, password, role string, passwordRequired bool) error {
	if !usernamePattern.MatchString(strings.TrimSpace(username)) {
		return errors.New("kullanıcı adı 3-50 karakter olmalı")
	}
	if passwordRequired || password != "" {
		if len([]rune(password)) < 8 || len([]rune(password)) > 128 {
			return errors.New("parola 8-128 karakter olmalı")
		}
	}
	if role != "admin" && role != "user" {
		return errors.New("geçersiz rol")
	}
	return nil
}

func usersExist(db *sql.DB) bool {
	var count int
	_ = db.QueryRow(`SELECT COUNT(*) FROM krio_users`).Scan(&count)
	return count > 0
}

func setting(db *sql.DB, key string) string {
	var value string
	_ = db.QueryRow(`SELECT value FROM krio_settings WHERE key=?`, key).Scan(&value)
	return value
}

func createUser(db *sql.DB, username, password, role string, profiles []string, templates []int64) (appUser, error) {
	username = strings.TrimSpace(username)
	if err := validateUserInput(username, password, role, true); err != nil {
		return appUser{}, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return appUser{}, err
	}
	tx, err := db.Begin()
	if err != nil {
		return appUser{}, err
	}
	defer tx.Rollback()
	result, err := tx.Exec(`INSERT INTO krio_users(username,password_hash,role,created_at) VALUES(?,?,?,?)`, username, string(hash), role, time.Now().UnixMilli())
	if err != nil {
		return appUser{}, errors.New("kullanıcı adı zaten kullanılıyor")
	}
	id, _ := result.LastInsertId()
	if err = replaceUserAccess(tx, id, profiles, templates); err != nil {
		return appUser{}, err
	}
	if err = tx.Commit(); err != nil {
		return appUser{}, err
	}
	return appUser{ID: id, Username: username, Role: role, ProfileIDs: profiles, TemplateIDs: templates}, nil
}

func updateUser(db *sql.DB, id int64, username, password, role string, profiles []string, templates []int64) (appUser, error) {
	username = strings.TrimSpace(username)
	if err := validateUserInput(username, password, role, false); err != nil {
		return appUser{}, err
	}
	var oldRole string
	if err := db.QueryRow(`SELECT role FROM krio_users WHERE id=?`, id).Scan(&oldRole); err != nil {
		return appUser{}, err
	}
	if oldRole == "admin" && role != "admin" {
		var admins int
		_ = db.QueryRow(`SELECT COUNT(*) FROM krio_users WHERE role='admin'`).Scan(&admins)
		if admins <= 1 {
			return appUser{}, errors.New("son yönetici kullanıcıya dönüştürülemez")
		}
	}
	tx, err := db.Begin()
	if err != nil {
		return appUser{}, err
	}
	defer tx.Rollback()
	if password == "" {
		_, err = tx.Exec(`UPDATE krio_users SET username=?,role=? WHERE id=?`, username, role, id)
	} else {
		var hash []byte
		hash, err = bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err == nil {
			_, err = tx.Exec(`UPDATE krio_users SET username=?,password_hash=?,role=? WHERE id=?`, username, string(hash), role, id)
		}
	}
	if err != nil {
		return appUser{}, errors.New("kullanıcı güncellenemedi")
	}
	if err = replaceUserAccess(tx, id, profiles, templates); err != nil {
		return appUser{}, err
	}
	if err = tx.Commit(); err != nil {
		return appUser{}, err
	}
	return userByID(db, id)
}

func replaceUserAccess(tx *sql.Tx, id int64, profiles []string, templates []int64) error {
	if _, err := tx.Exec(`DELETE FROM krio_user_profile_access WHERE user_id=?; DELETE FROM krio_user_template_access WHERE user_id=?`, id, id); err != nil {
		return err
	}
	for _, profile := range profiles {
		if _, err := tx.Exec(`INSERT OR IGNORE INTO krio_user_profile_access(user_id,profile_id) VALUES(?,?)`, id, profile); err != nil {
			return err
		}
	}
	for _, template := range templates {
		if _, err := tx.Exec(`INSERT OR IGNORE INTO krio_user_template_access(user_id,template_id) VALUES(?,?)`, id, template); err != nil {
			return err
		}
	}
	return nil
}

func userByID(db *sql.DB, id int64) (appUser, error) {
	var user appUser
	err := db.QueryRow(`SELECT id,username,role FROM krio_users WHERE id=?`, id).Scan(&user.ID, &user.Username, &user.Role)
	if err != nil {
		return user, err
	}
	rows, _ := db.Query(`SELECT profile_id FROM krio_user_profile_access WHERE user_id=? ORDER BY profile_id`, id)
	if rows != nil {
		for rows.Next() {
			var value string
			_ = rows.Scan(&value)
			user.ProfileIDs = append(user.ProfileIDs, value)
		}
		rows.Close()
	}
	rows, _ = db.Query(`SELECT template_id FROM krio_user_template_access WHERE user_id=? ORDER BY template_id`, id)
	if rows != nil {
		for rows.Next() {
			var value int64
			_ = rows.Scan(&value)
			user.TemplateIDs = append(user.TemplateIDs, value)
		}
		rows.Close()
	}
	return user, nil
}

func allUsers(db *sql.DB) ([]appUser, error) {
	rows, err := db.Query(`SELECT id FROM krio_users ORDER BY username`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	result := make([]appUser, 0, len(ids))
	for _, id := range ids {
		user, readErr := userByID(db, id)
		if readErr != nil {
			return nil, readErr
		}
		result = append(result, user)
	}
	return result, rows.Err()
}

func authenticateUser(db *sql.DB, username, password string) (appUser, error) {
	var id int64
	var hash string
	if err := db.QueryRow(`SELECT id,password_hash FROM krio_users WHERE username=? COLLATE NOCASE`, strings.TrimSpace(username)).Scan(&id, &hash); err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return appUser{}, errors.New("kullanıcı adı veya parola hatalı")
	}
	return userByID(db, id)
}

func newSession(db *sql.DB, userID int64) (string, time.Time, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token := hex.EncodeToString(raw)
	hash := sha256.Sum256([]byte(token))
	expires := time.Now().Add(24 * time.Hour)
	_, err := db.Exec(`INSERT INTO krio_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)`, hex.EncodeToString(hash[:]), userID, expires.UnixMilli())
	return token, expires, err
}

func sessionUser(db *sql.DB, token string) (appUser, error) {
	hash := sha256.Sum256([]byte(token))
	var id int64
	err := db.QueryRow(`SELECT user_id FROM krio_sessions WHERE token_hash=? AND expires_at>?`, hex.EncodeToString(hash[:]), time.Now().UnixMilli()).Scan(&id)
	if err != nil {
		return appUser{}, err
	}
	return userByID(db, id)
}

func deleteSession(db *sql.DB, token string) {
	hash := sha256.Sum256([]byte(token))
	_, _ = db.Exec(`DELETE FROM krio_sessions WHERE token_hash=?`, hex.EncodeToString(hash[:]))
}

func deleteUser(db *sql.DB, id int64) error {
	var admins int
	_ = db.QueryRow(`SELECT COUNT(*) FROM krio_users WHERE role='admin'`).Scan(&admins)
	var targetRole string
	if err := db.QueryRow(`SELECT role FROM krio_users WHERE id=?`, id).Scan(&targetRole); err != nil {
		return errors.New("kullanıcı bulunamadı")
	}
	if targetRole == "admin" && admins <= 1 {
		return errors.New("son yönetici silinemez")
	}
	_, err := db.Exec(`DELETE FROM krio_users WHERE id=?`, id)
	return err
}

func resetApp(db *sql.DB) error {
	tables := []string{
		`krio_messages`, `krio_chats`, `krio_profile_names`,
		`krio_bulk_operation_items`, `krio_bulk_operations`, `krio_bulk_templates`,
		`krio_status_posts`,
		`krio_user_template_access`, `krio_user_profile_access`,
		`krio_sessions`, `krio_users`, `krio_settings`,
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, table := range tables {
		if _, err := tx.Exec(`DELETE FROM ` + table); err != nil {
			return err
		}
	}
	return tx.Commit()
}
