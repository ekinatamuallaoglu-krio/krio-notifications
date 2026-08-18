package app

import (
	"embed"
	"io/fs"
	"net/http"
	"regexp"
	"sync"

	"krio-chat/backend/internal/app/license"
)

//go:embed web/dist
var webFiles embed.FS

type server struct {
	wa        *whatsApp
	checker   license.Checker
	licenseMu sync.RWMutex
	license   license.State
	network   *networkController
}

func (s *server) currentLicense() license.State {
	s.licenseMu.RLock()
	defer s.licenseMu.RUnlock()
	return s.license
}

func (s *server) setLicense(value license.State) {
	s.licenseMu.Lock()
	s.license = value
	s.licenseMu.Unlock()
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/app/status", s.appStatus)
	mux.HandleFunc("GET /api/settings/network", s.networkSettings)
	mux.HandleFunc("PATCH /api/settings/network", s.updateNetworkSettings)
	mux.HandleFunc("POST /api/setup", s.setup)
	mux.HandleFunc("POST /api/login", s.login)
	mux.HandleFunc("POST /api/session/logout", s.sessionLogout)
	mux.HandleFunc("GET /api/users", s.listUsers)
	mux.HandleFunc("POST /api/users", s.postUser)
	mux.HandleFunc("PATCH /api/users/{id}", s.patchUser)
	mux.HandleFunc("DELETE /api/users/{id}", s.deleteUser)
	mux.HandleFunc("POST /api/app/reset", s.resetApp)
	mux.HandleFunc("GET /api/auth", s.auth)
	mux.HandleFunc("POST /api/auth/logout", s.logout)
	mux.HandleFunc("GET /api/profiles", s.getProfiles)
	mux.HandleFunc("POST /api/profiles", s.addProfile)
	mux.HandleFunc("POST /api/profiles/{id}/activate", s.activateProfile)
	mux.HandleFunc("PATCH /api/profiles/{id}", s.renameProfile)
	mux.HandleFunc("POST /api/profiles/{id}/sync-history", s.syncHistory)
	mux.HandleFunc("DELETE /api/profiles/{id}", s.logoutProfile)
	mux.HandleFunc("GET /api/profiles/{id}/avatar", s.profileAvatar)
	mux.HandleFunc("GET /api/chats", s.getChats)
	mux.HandleFunc("GET /api/chats/{id}/messages", s.getMessages)
	mux.HandleFunc("GET /api/chats/{id}/messages/{messageID}/media", s.getMedia)
	mux.HandleFunc("POST /api/chats/{id}/messages", s.postMessage)
	mux.HandleFunc("POST /api/chats/{id}/messages/{messageID}/forward", s.forwardMessage)
	mux.HandleFunc("PUT /api/chats/{id}/messages/{messageID}/reaction", s.reactMessage)
	mux.HandleFunc("POST /api/chats/{id}/typing", s.postTyping)
	mux.HandleFunc("POST /api/chats/{id}/presence", s.postPresence)
	mux.HandleFunc("POST /api/chats/{id}/read", s.markRead)
	mux.HandleFunc("GET /api/events", s.events)
	mux.HandleFunc("GET /api/bulk/templates", s.getBulkTemplates)
	mux.HandleFunc("POST /api/bulk/templates", s.postBulkTemplate)
	mux.HandleFunc("DELETE /api/bulk/templates/{id}", s.deleteBulkTemplate)
	mux.HandleFunc("GET /api/bulk/recipients/{profileID}", s.bulkRecipients)
	mux.HandleFunc("POST /api/bulk/send", s.sendBulk)
	mux.HandleFunc("GET /api/bulk/reports", s.getBulkReports)
	mux.HandleFunc("GET /api/bulk/reports/{id}", s.getBulkReport)
	mux.HandleFunc("GET /api/status-posts", s.getStatusPosts)
	mux.HandleFunc("POST /api/status-posts", s.postStatusPost)
	mux.HandleFunc("DELETE /api/status-posts/{id}", s.deleteStatusPost)
	dist, _ := fs.Sub(webFiles, "web/dist")
	mux.Handle("/", http.FileServer(http.FS(dist)))
	return cors(s.protect(mux))
}

var templateVariable = regexp.MustCompile(`\{\{\s*([\pL_][\pL\pN_]{0,39})\s*\}\}`)

func (s *server) auth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.wa.auth())
}

func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	if err := s.wa.logout(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) syncHistory(w http.ResponseWriter, r *http.Request) {
	if err := s.wa.syncHistory(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
