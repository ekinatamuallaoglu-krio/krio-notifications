package app

import (
	"encoding/json"
	"net/http"
	"strconv"
)

func (s *server) listUsers(w http.ResponseWriter, _ *http.Request) {
	items, err := allUsers(s.wa.db)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, items)
}

func (s *server) postUser(w http.ResponseWriter, r *http.Request) {
	var body userRequest
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&body) != nil {
		writeError(w, 400, "geçersiz istek")
		return
	}
	item, err := createUser(s.wa.db, body.Username, body.Password, body.Role, body.ProfileIDs, body.TemplateIDs)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	writeJSON(w, 201, item)
}

func (s *server) patchUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, 400, "geçersiz kullanıcı")
		return
	}
	var body userRequest
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&body) != nil {
		writeError(w, 400, "geçersiz istek")
		return
	}
	item, err := updateUser(s.wa.db, id, body.Username, body.Password, body.Role, body.ProfileIDs, body.TemplateIDs)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	writeJSON(w, 200, item)
}

func (s *server) deleteUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, 400, "geçersiz kullanıcı")
		return
	}
	user := r.Context().Value(userContextKey{}).(appUser)
	if user.ID == id {
		writeError(w, 400, "kendi hesabınızı silemezsiniz")
		return
	}
	if err := deleteUser(s.wa.db, id); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
