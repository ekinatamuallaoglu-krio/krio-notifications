package app

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"go.mau.fi/whatsmeow/types"
)

func templateVariables(body string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, match := range templateVariable.FindAllStringSubmatch(body, -1) {
		if !seen[match[1]] {
			seen[match[1]] = true
			result = append(result, match[1])
		}
	}
	return result
}

func validateMessage(text string) error {
	length := len([]rune(strings.TrimSpace(text)))
	if length < 1 || length > 2000 {
		return errors.New("mesaj 1-2000 karakter olmalı")
	}
	return nil
}

func parseChatID(value string) (types.JID, error) {
	if !strings.Contains(value, "@") {
		return types.JID{}, errors.New("invalid jid")
	}
	id, err := types.ParseJID(value)
	if err != nil || id.IsEmpty() || (id.Server != types.DefaultUserServer && id.Server != types.GroupServer && id.Server != types.HiddenUserServer) {
		return types.JID{}, errors.New("invalid jid")
	}
	return id, nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
