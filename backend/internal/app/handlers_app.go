package app

import "krio-chat/backend/internal/app/license"

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const sessionCookie = "krio_session"

type appStatusResponse struct {
	SetupRequired bool           `json:"setupRequired"`
	Authenticated bool           `json:"authenticated"`
	User          *appUser       `json:"user,omitempty"`
	License       license.State  `json:"license"`
	Network       map[string]any `json:"network"`
}

func (s *server) appStatus(w http.ResponseWriter, r *http.Request) {
	status := appStatusResponse{SetupRequired: !usersExist(s.wa.db), License: s.currentLicense(), Network: s.networkStatus()}
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		if user, authErr := sessionUser(s.wa.db, cookie.Value); authErr == nil {
			status.Authenticated, status.User = true, &user
		}
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *server) setup(w http.ResponseWriter, r *http.Request) {
	if usersExist(s.wa.db) {
		writeError(w, http.StatusConflict, "kurulum zaten tamamlandı")
		return
	}
	var body struct {
		LicenseKey string `json:"licenseKey"`
		Username   string `json:"username"`
		Password   string `json:"password"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body) != nil {
		writeError(w, 400, "geçersiz istek")
		return
	}
	if err := validateUserInput(strings.TrimSpace(body.Username), body.Password, "admin", true); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	license, err := s.checker.Check(ctx, body.LicenseKey)
	if err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	user, err := setupAdmin(s.wa.db, strings.TrimSpace(body.LicenseKey), strings.TrimSpace(body.Username), body.Password)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	s.setLicense(license)
	s.wa.connectAll()
	s.wa.startStatusScheduler()
	s.setSession(w, r, user.ID)
	writeJSON(w, http.StatusOK, appStatusResponse{Authenticated: true, User: &user, License: license})
}

func setupAdmin(db *sql.DB, key, username, password string) (appUser, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return appUser{}, err
	}
	tx, err := db.Begin()
	if err != nil {
		return appUser{}, err
	}
	defer tx.Rollback()
	var count int
	if err = tx.QueryRow(`SELECT COUNT(*) FROM krio_users`).Scan(&count); err != nil || count != 0 {
		return appUser{}, errors.New("kurulum zaten tamamlandı")
	}
	result, err := tx.Exec(`INSERT INTO krio_users(username,password_hash,role,created_at) VALUES(?,?,?,?)`, username, string(hash), "admin", time.Now().UnixMilli())
	if err != nil {
		return appUser{}, err
	}
	if _, err = tx.Exec(`INSERT INTO krio_settings(key,value) VALUES('license_key',?)`, key); err != nil {
		return appUser{}, err
	}
	if err = tx.Commit(); err != nil {
		return appUser{}, err
	}
	id, _ := result.LastInsertId()
	return appUser{ID: id, Username: username, Role: "admin"}, nil
}

func (s *server) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body) != nil {
		writeError(w, 400, "geçersiz istek")
		return
	}
	if message := s.currentLicense().Error; message != "" {
		writeError(w, http.StatusForbidden, message)
		return
	}
	user, err := authenticateUser(s.wa.db, body.Username, body.Password)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "kullanıcı adı veya parola hatalı")
		return
	}
	s.setSession(w, r, user.ID)
	writeJSON(w, http.StatusOK, appStatusResponse{Authenticated: true, User: &user, License: s.currentLicense()})
}

func (s *server) setSession(w http.ResponseWriter, r *http.Request, userID int64) {
	token, expires, err := newSession(s.wa.db, userID)
	if err != nil {
		return
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: token, Path: "/", Expires: expires, HttpOnly: true, Secure: r.TLS != nil, SameSite: http.SameSiteStrictMode})
}

func (s *server) sessionLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		deleteSession(s.wa.db, cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
	w.WriteHeader(http.StatusNoContent)
}

type userRequest struct {
	Username    string   `json:"username"`
	Password    string   `json:"password"`
	Role        string   `json:"role"`
	ProfileIDs  []string `json:"profileIds"`
	TemplateIDs []int64  `json:"templateIds"`
}

func (s *server) activeProfileID() string {
	for _, profile := range s.wa.profiles() {
		if profile.Active {
			return profile.ID
		}
	}
	return ""
}

func (s *server) resetApp(w http.ResponseWriter, r *http.Request) {
	if err := s.wa.logout(r.Context()); err != nil {
		writeError(w, 500, "WhatsApp bağlantısı kesilemedi: "+err.Error())
		return
	}
	if err := resetApp(s.wa.db); err != nil {
		writeError(w, 500, "veritabanı sıfırlanamadı: "+err.Error())
		return
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
	writeJSON(w, http.StatusOK, appStatusResponse{SetupRequired: true})
}
