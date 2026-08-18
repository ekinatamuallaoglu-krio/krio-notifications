package app

import (
	"encoding/json"
	"mime"
	"net/http"
	"strings"

	"go.mau.fi/whatsmeow/types"
)

func (s *server) getChats(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.wa.chatList())
}

func (s *server) getMessages(w http.ResponseWriter, r *http.Request) {
	id, err := parseChatID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz sohbet")
		return
	}
	writeJSON(w, http.StatusOK, s.wa.messageList(id.String()))
}

func (s *server) getMedia(w http.ResponseWriter, r *http.Request) {
	id, err := parseChatID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz sohbet")
		return
	}
	data, contentType, fileName, err := s.wa.media(r.Context(), id.String(), r.PathValue("messageID"))
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=86400")
	if fileName != "" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": fileName}))
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (s *server) postMessage(w http.ResponseWriter, r *http.Request) {
	id, err := parseChatID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz sohbet")
		return
	}
	var body struct {
		Text      string `json:"text"`
		ReplyToID string `json:"replyToId"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10))
	if decoder.Decode(&body) != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek")
		return
	}
	if err := validateMessage(body.Text); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	message, err := s.wa.send(r.Context(), id, strings.TrimSpace(body.Text), body.ReplyToID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, message)
}

func (s *server) forwardMessage(w http.ResponseWriter, r *http.Request) {
	destination, err := parseChatID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz sohbet")
		return
	}
	var body struct {
		Destination string `json:"destination"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body) != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek")
		return
	}
	target, err := parseChatID(body.Destination)
	if err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz hedef sohbet")
		return
	}
	message, err := s.wa.forward(r.Context(), destination.String(), r.PathValue("messageID"), target)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, message)
}

func (s *server) reactMessage(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Emoji string `json:"emoji"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body) != nil || len([]rune(body.Emoji)) > 8 {
		writeError(w, http.StatusBadRequest, "geçersiz reaksiyon")
		return
	}
	if err := s.wa.react(r.Context(), r.PathValue("id"), r.PathValue("messageID"), body.Emoji); err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) postTyping(w http.ResponseWriter, r *http.Request) {
	id, err := parseChatID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz sohbet")
		return
	}
	var body struct {
		Typing bool `json:"typing"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body) != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek")
		return
	}
	if err := s.wa.setTyping(r.Context(), id, body.Typing); err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) markRead(w http.ResponseWriter, r *http.Request) {
	if err := s.wa.markRead(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) postPresence(w http.ResponseWriter, r *http.Request) {
	id, err := parseChatID(r.PathValue("id"))
	if err != nil || id.Server == types.GroupServer {
		writeError(w, http.StatusBadRequest, "geçersiz kişi")
		return
	}
	if err := s.wa.subscribePresence(r.Context(), id); err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
