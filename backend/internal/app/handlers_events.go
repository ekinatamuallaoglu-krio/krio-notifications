package app

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func (s *server) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "canlı bağlantı desteklenmiyor")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	listener := s.wa.subscribe()
	defer s.wa.unsubscribe(listener)
	user := currentUser(r.Context())
	for {
		select {
		case event := <-listener:
			if user.Role != "admin" {
				if event.Type != "profiles" && event.Type != "profileMessage" && !canProfile(user, s.activeProfileID()) {
					continue
				}
				if event.Type == "profiles" {
					if profiles, ok := event.Payload.([]Profile); ok {
						filtered := profiles[:0]
						for _, profile := range profiles {
							if canProfile(user, profile.ID) {
								filtered = append(filtered, profile)
							}
						}
						event.Payload = filtered
					}
				}
				if event.Type == "profileMessage" {
					if item, ok := event.Payload.(profileMessageEvent); ok && !canProfile(user, item.ProfileID) {
						continue
					}
				}
			}
			payload, _ := json.Marshal(event)
			fmt.Fprintf(w, "data: %s\n\n", payload)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}
