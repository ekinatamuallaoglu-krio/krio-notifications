package app

import (
	"context"
	"net/http"
	"strings"
)

func (s *server) protect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions || !strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api/app/status" || r.URL.Path == "/api/setup" || r.URL.Path == "/api/login" {
			next.ServeHTTP(w, r)
			return
		}
		cookie, err := r.Cookie(sessionCookie)
		if err != nil {
			writeError(w, 401, "oturum gerekli")
			return
		}
		user, err := sessionUser(s.wa.db, cookie.Value)
		if err != nil {
			writeError(w, 401, "oturum gerekli")
			return
		}
		if !s.authorizedRequest(user, r) {
			writeError(w, 403, "bu işlem için yetkiniz yok")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userContextKey{}, user)))
	})
}

func (s *server) authorizedRequest(user appUser, r *http.Request) bool {
	if user.Role == "admin" {
		return true
	}
	if strings.HasPrefix(r.URL.Path, "/api/settings/network") {
		return false
	}
	path := r.URL.Path
	if path == "/api/auth/logout" {
		return false
	}
	if strings.HasPrefix(path, "/api/users") || path == "/api/profiles" && r.Method != http.MethodGet || path == "/api/app/reset" {
		return false
	}
	if strings.HasPrefix(path, "/api/profiles/") {
		value := strings.TrimPrefix(path, "/api/profiles/")
		id := strings.Split(value, "/")[0]
		if !canProfile(user, id) {
			return false
		}
		return r.Method == http.MethodGet && strings.HasSuffix(path, "/avatar") || r.Method == http.MethodPost && strings.HasSuffix(path, "/activate")
	}
	if strings.HasPrefix(path, "/api/chats") || path == "/api/events" {
		return canProfile(user, s.activeProfileID())
	}
	if path == "/api/bulk/templates" {
		return r.Method == http.MethodGet
	}
	if strings.HasPrefix(path, "/api/bulk/templates/") {
		return false
	}
	if strings.HasPrefix(path, "/api/bulk/recipients/") {
		return canProfile(user, strings.TrimPrefix(path, "/api/bulk/recipients/"))
	}
	return true
}
