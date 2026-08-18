package app

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (s *server) getProfiles(w http.ResponseWriter, r *http.Request) {
	items := s.wa.profiles()
	user := currentUser(r.Context())
	if user.Role != "admin" {
		filtered := items[:0]
		for _, item := range items {
			if canProfile(user, item.ID) {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *server) addProfile(w http.ResponseWriter, _ *http.Request) {
	s.wa.addProfile()
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) activateProfile(w http.ResponseWriter, r *http.Request) {
	if err := s.wa.switchProfile(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Profiles []Profile `json:"profiles"`
		Chats    []Chat    `json:"chats"`
	}{s.wa.profiles(), s.wa.chatList()})
}

func (s *server) renameProfile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Nickname    string `json:"nickname"`
		Sound       string `json:"sound"`
		Volume      int    `json:"volume"`
		TypingMin   int    `json:"typingMin"`
		TypingMax   int    `json:"typingMax"`
		DelayMin    int    `json:"delayMin"`
		DelayMax    int    `json:"delayMax"`
		WorkEnabled bool   `json:"workEnabled"`
		WorkDays    string `json:"workDays"`
		WorkStart   string `json:"workStart"`
		WorkEnd     string `json:"workEnd"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body) != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek")
		return
	}
	body.Nickname = strings.TrimSpace(body.Nickname)
	if len([]rune(body.Nickname)) > 40 {
		writeError(w, http.StatusBadRequest, "takma ad en fazla 40 karakter olabilir")
		return
	}
	validSounds := map[string]bool{"silent": true, "chime": true, "soft": true, "pop": true, "bell": true}
	if !validSounds[body.Sound] || body.Volume < 0 || body.Volume > 100 {
		writeError(w, http.StatusBadRequest, "geçersiz ses ayarı")
		return
	}
	if body.TypingMin < 10 || body.TypingMax < body.TypingMin || body.TypingMax > 2000 || body.DelayMin < 0 || body.DelayMax < body.DelayMin || body.DelayMax > 60000 {
		writeError(w, http.StatusBadRequest, "geçersiz toplu gönderim gecikmesi")
		return
	}
	workEnabled := 0
	if body.WorkEnabled {
		workEnabled = 1
	}
	workDays := strings.TrimSpace(body.WorkDays)
	if workDays == "" {
		workDays = "1,2,3,4,5"
	}
	workStart := strings.TrimSpace(body.WorkStart)
	if workStart == "" {
		workStart = "09:00"
	}
	workEnd := strings.TrimSpace(body.WorkEnd)
	if workEnd == "" {
		workEnd = "18:00"
	}
	if err := s.wa.updateProfile(r.Context(), r.PathValue("id"), body.Nickname, body.Sound, body.Volume, body.TypingMin, body.TypingMax, body.DelayMin, body.DelayMax, workEnabled, workDays, workStart, workEnd); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) logoutProfile(w http.ResponseWriter, r *http.Request) {
	if err := s.wa.logoutProfile(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) profileAvatar(w http.ResponseWriter, r *http.Request) {
	avatarURL, err := s.wa.profileAvatar(r.Context(), r.PathValue("id"))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	parsed, err := url.Parse(avatarURL)
	if err != nil || parsed.Scheme != "https" {
		http.NotFound(w, r)
		return
	}
	response, err := (&http.Client{Timeout: 8 * time.Second}).Get(avatarURL)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer response.Body.Close()
	contentType := response.Header.Get("Content-Type")
	if response.StatusCode != http.StatusOK || !strings.HasPrefix(contentType, "image/") {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_, _ = io.Copy(w, http.MaxBytesReader(w, response.Body, 2<<20))
}
