package app

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

func (s *server) getBulkTemplates(w http.ResponseWriter, r *http.Request) {
	items, err := bulkTemplates(s.wa.db)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	user := currentUser(r.Context())
	if user.Role != "admin" {
		filtered := items[:0]
		for _, item := range items {
			if canTemplate(user, item.ID) {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}
	writeJSON(w, 200, items)
}

func (s *server) postBulkTemplate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
		Body string `json:"body"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 10<<10)).Decode(&body) != nil {
		writeError(w, 400, "geçersiz istek")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Body = strings.TrimSpace(body.Body)
	if len([]rune(body.Name)) < 1 || len([]rune(body.Name)) > 80 || len([]rune(body.Body)) < 1 || len([]rune(body.Body)) > 4000 {
		writeError(w, 400, "şablon adı veya içeriği geçersiz")
		return
	}
	item, err := saveBulkTemplate(s.wa.db, body.ID, body.Name, body.Body)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 201, item)
}

func (s *server) deleteBulkTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || deleteBulkTemplate(s.wa.db, id) != nil {
		writeError(w, 400, "şablon silinemedi")
		return
	}
	w.WriteHeader(204)
}

func (s *server) bulkRecipients(w http.ResponseWriter, r *http.Request) {
	chats, err := s.wa.bulkRecipients(r.PathValue("profileID"))
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, chats)
}

func (s *server) sendBulk(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ProfileID  string            `json:"profileId"`
		TemplateID int64             `json:"templateId"`
		Recipients []string          `json:"recipients"`
		Values     map[string]string `json:"values"`
		Rows       []bulkSendRow     `json:"rows"`
		Mode       string            `json:"mode"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&body) != nil || len(body.Recipients)+len(body.Rows) < 1 || len(body.Recipients)+len(body.Rows) > 50 {
		writeError(w, 400, "1-50 alıcı seçilmeli")
		return
	}
	user := currentUser(r.Context())
	if !canProfile(user, body.ProfileID) || !canTemplate(user, body.TemplateID) {
		writeError(w, http.StatusForbidden, "profil veya şablon erişiminiz yok")
		return
	}
	templates, _ := bulkTemplates(s.wa.db)
	var template *BulkTemplate
	for i := range templates {
		if templates[i].ID == body.TemplateID {
			template = &templates[i]
		}
	}
	if template == nil {
		writeError(w, 400, "şablon bulunamadı")
		return
	}
	rows := body.Rows
	for _, recipient := range body.Recipients {
		rows = append(rows, bulkSendRow{Recipient: recipient, Values: body.Values})
	}
	for _, row := range rows {
		if strings.TrimSpace(row.Recipient) == "" {
			writeError(w, 400, "alıcı alanı gerekli")
			return
		}
		for _, variable := range templateVariables(template.Body) {
			if strings.TrimSpace(row.Values[variable]) == "" {
				writeError(w, 400, variable+" alanı gerekli")
				return
			}
		}
	}
	operation, err := s.wa.queueBulk(user.ID, body.ProfileID, *template, body.Mode, rows)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, operation)
}

func (s *server) getBulkReports(w http.ResponseWriter, r *http.Request) {
	items, err := bulkOperationsForUser(s.wa.db, currentUser(r.Context()))
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, items)
}

func (s *server) getBulkReport(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, 400, "geçersiz rapor")
		return
	}
	item, err := bulkOperationForUser(s.wa.db, id, currentUser(r.Context()))
	if err == sql.ErrNoRows {
		writeError(w, 404, "rapor bulunamadı")
		return
	}
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, item)
}
