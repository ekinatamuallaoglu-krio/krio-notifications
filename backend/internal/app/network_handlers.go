package app

import (
	"encoding/json"
	"net/http"
)

func (s *server) networkSettings(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.networkStatus())
}

func (s *server) updateNetworkSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz ağ ayarı")
		return
	}
	if err := s.network.set(body.Enabled); err != nil {
		writeError(w, http.StatusServiceUnavailable, errNetworkUnavailable.Error())
		return
	}
	value := "0"
	if body.Enabled {
		value = "1"
	}
	if _, err := s.wa.db.Exec(`INSERT INTO krio_settings(key,value) VALUES('network_access',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, value); err != nil {
		writeError(w, http.StatusInternalServerError, "ağ ayarı kaydedilemedi")
		return
	}
	writeJSON(w, http.StatusOK, s.networkStatus())
}
