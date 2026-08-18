package license

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type State struct {
	Expired        bool   `json:"expired"`
	ExpirationDate string `json:"expirationDate,omitempty"`
	Error          string `json:"-"`
}

type Checker struct {
	URL    string
	Client *http.Client
}

func (checker Checker) Check(ctx context.Context, key string) (State, error) {
	key = strings.TrimSpace(key)
	if key == "" || len(key) > 64 {
		return State{}, errors.New("geçersiz lisans anahtarı")
	}
	payload, _ := json.Marshal(map[string]string{"licence_key": key})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, checker.URL, bytes.NewReader(payload))
	if err != nil {
		return State{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	response, err := checker.Client.Do(req)
	if err != nil {
		return State{}, fmt.Errorf("lisans doğrulanamadı: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return State{}, fmt.Errorf("lisans servisi %d yanıtı verdi", response.StatusCode)
	}
	var result struct {
		Valid          bool    `json:"valid"`
		Reason         *string `json:"reason"`
		ExpirationDate *string `json:"expiration_date"`
	}
	if json.NewDecoder(io.LimitReader(response.Body, 8<<10)).Decode(&result) != nil {
		return State{}, errors.New("lisans servisi geçersiz yanıt verdi")
	}
	date := ""
	if result.ExpirationDate != nil {
		date = *result.ExpirationDate
	}
	if result.Valid {
		return State{ExpirationDate: date}, nil
	}
	if result.Reason != nil && *result.Reason == "expired" {
		return State{Expired: true, ExpirationDate: date}, nil
	}
	reason := "geçersiz"
	if result.Reason != nil {
		reason = *result.Reason
	}
	return State{}, fmt.Errorf("lisans kullanılamıyor: %s", reason)
}

func DefaultChecker() Checker {
	return Checker{URL: "https://itsme.krio.tr/api/licence/check", Client: &http.Client{Timeout: 10 * time.Second}}
}
