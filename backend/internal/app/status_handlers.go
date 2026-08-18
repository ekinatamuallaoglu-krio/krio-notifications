package app

import (
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (s *server) getStatusPosts(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r.Context())
	items, err := statusPostsForUser(s.wa.db, user)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	filtered := items[:0]
	for _, item := range items {
		if canProfile(user, item.ProfileID) {
			filtered = append(filtered, item)
		}
	}
	writeJSON(w, 200, filtered)
}

func (s *server) postStatusPost(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 17<<20)
	if err := r.ParseMultipartForm(17 << 20); err != nil {
		writeError(w, 400, "status verisi çok büyük veya geçersiz")
		return
	}
	defer r.MultipartForm.RemoveAll()
	user := currentUser(r.Context())
	profileID, kind, text := strings.TrimSpace(r.FormValue("profileId")), r.FormValue("kind"), strings.TrimSpace(r.FormValue("text"))
	if !canProfile(user, profileID) {
		writeError(w, http.StatusForbidden, "profil erişiminiz yok")
		return
	}
	if kind != "text" && kind != "image" && kind != "video" || len([]rune(text)) > 2000 || kind == "text" && text == "" {
		writeError(w, 400, "status içeriği geçersiz")
		return
	}
	scheduledAt := time.Now()
	if value := r.FormValue("scheduledAt"); value != "" {
		parsed, err := time.Parse(time.RFC3339, value)
		if err != nil || parsed.Before(time.Now().Add(-time.Minute)) || parsed.After(time.Now().AddDate(1, 0, 0)) {
			writeError(w, 400, "planlama zamanı geçersiz")
			return
		}
		scheduledAt = parsed
	}
	var media []byte
	var mime, fileName string
	if kind != "text" {
		file, header, err := r.FormFile("media")
		if err != nil {
			writeError(w, 400, "görsel veya video seçilmeli")
			return
		}
		defer file.Close()
		media, err = io.ReadAll(io.LimitReader(file, (16<<20)+1))
		if err != nil || len(media) == 0 || len(media) > 16<<20 {
			writeError(w, 400, "medya en fazla 16 MB olabilir")
			return
		}
		mime, fileName = http.DetectContentType(media), header.Filename
		if kind == "image" && !strings.HasPrefix(mime, "image/") || kind == "video" && !strings.HasPrefix(mime, "video/") {
			writeError(w, 400, "seçilen dosya status türüyle uyuşmuyor")
			return
		}
	}
	item, err := createStatusPost(s.wa.db, user.ID, profileID, kind, text, mime, fileName, media, scheduledAt)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	go s.wa.runDueStatusPosts()
	writeJSON(w, http.StatusAccepted, item)
}

func (s *server) deleteStatusPost(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, 400, "geçersiz status")
		return
	}
	user := currentUser(r.Context())
	var profileID string
	if err = s.wa.db.QueryRow(`SELECT profile_id FROM krio_status_posts WHERE id=?`, id).Scan(&profileID); err != nil {
		writeError(w, 404, "bekleyen status bulunamadı")
		return
	}
	if !canProfile(user, profileID) {
		writeError(w, http.StatusForbidden, "profil erişiminiz yok")
		return
	}
	deleted, err := deleteQueuedStatusPost(s.wa.db, id, user)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if !deleted {
		writeError(w, 404, "bekleyen status bulunamadı")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
