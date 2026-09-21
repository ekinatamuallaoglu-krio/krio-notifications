package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"krio-chat/backend/internal/store"
)

const instagramRelay = "https://itsme.krio.tr"

type instagramClient struct {
	db      *sql.DB
	client  *http.Client
	license string
	mu      sync.RWMutex
	active  string
}

func newInstagram(db *sql.DB, license string) *instagramClient {
	return &instagramClient{db: db, license: license, client: &http.Client{Timeout: 20 * time.Second}}
}

type instagramRelayClient struct {
	SessionID    string `json:"session_id"`
	AuthorizeURL string `json:"authorize_url"`
}

func (i *instagramClient) profiles() []Profile {
	items := store.InstagramProfiles(i.db)
	i.mu.RLock()
	active := i.active
	i.mu.RUnlock()
	result := make([]Profile, 0, len(items))
	for _, item := range items {
		name := item.Username
		if name == "" {
			name = item.AccountID
		}
		result = append(result, Profile{ID: item.ProfileID, Provider: "instagram", AccountID: item.AccountID, Name: name, WhatsAppName: name, Active: item.ProfileID == active, Unread: profileUnread(i.db, item.ProfileID), Capabilities: map[string]bool{"sendText": true, "reply": true, "reaction": true, "typing": true, "markRead": true, "readMedia": true, "historySync": true}})
	}
	return result
}

func (i *instagramClient) activate(id string) error {
	for _, p := range store.InstagramProfiles(i.db) {
		if p.ProfileID == id {
			i.mu.Lock()
			i.active = id
			i.mu.Unlock()
			return nil
		}
	}
	return errors.New("Instagram profili bulunamadı")
}

func (i *instagramClient) clearActive(id string) {
	i.mu.Lock()
	if i.active == id {
		i.active = ""
	}
	i.mu.Unlock()
}

func (i *instagramClient) activeFor(id string) bool {
	i.mu.RLock()
	defer i.mu.RUnlock()
	return i.active == id
}

func (i *instagramClient) createSession(ctx context.Context) (instagramRelayClient, error) {
	var result instagramRelayClient
	err := i.request(ctx, http.MethodPost, "/api/instagram/oauth/sessions", map[string]any{"licence_key": i.license}, &result)
	return result, err
}

func (i *instagramClient) session(ctx context.Context, id string) (map[string]any, error) {
	var result map[string]any
	err := i.request(ctx, http.MethodGet, "/api/instagram/oauth/sessions/"+url.PathEscape(id), nil, &result)
	return result, err
}

func (i *instagramClient) syncProfiles(ctx context.Context) error {
	var accounts []struct {
		AccountID string `json:"account_id"`
		Username  string `json:"username"`
		Cursor    string `json:"cursor"`
	}
	if err := i.request(ctx, http.MethodGet, "/api/instagram/connections", nil, &accounts); err != nil {
		return err
	}
	known := store.InstagramProfiles(i.db)
	for _, account := range accounts {
		id := "instagram:" + account.AccountID
		var sessionKey string
		for _, old := range known {
			if old.ProfileID == id {
				sessionKey = old.SessionKey
			}
		}
		if err := store.SaveInstagramProfile(i.db, store.InstagramProfile{ProfileID: id, AccountID: account.AccountID, Username: account.Username, SessionKey: sessionKey, Cursor: account.Cursor}); err != nil {
			return err
		}
	}
	return nil
}

func (i *instagramClient) chats(ctx context.Context) ([]Chat, error) {
	p, err := i.activeProfile()
	if err != nil {
		return nil, err
	}
	_ = i.syncEvents(ctx, p)
	var result struct {
		Data []struct {
			ID      string `json:"id"`
			Updated int64  `json:"updated_time"`
		} `json:"data"`
	}
	if err = i.accountRequest(ctx, p, http.MethodGet, "me/conversations", map[string]string{"platform": "instagram"}, nil, &result); err != nil {
		return nil, err
	}
	chats := make([]Chat, 0, len(result.Data))
	for _, item := range result.Data {
		chats = append(chats, Chat{ID: item.ID, Name: item.ID, Avatar: initials(item.ID), LastTime: time.Unix(item.Updated, 0).Format(time.RFC3339), Updated: time.Unix(item.Updated, 0)})
	}
	return chats, nil
}

func (i *instagramClient) messages(ctx context.Context, chatID string) ([]Message, error) {
	p, err := i.activeProfile()
	if err != nil {
		return nil, err
	}
	_ = i.syncEvents(ctx, p)
	var list struct {
		Messages struct {
			Data []struct {
				ID      string `json:"id"`
				Created string `json:"created_time"`
			} `json:"data"`
		} `json:"messages"`
	}
	if err = i.accountRequest(ctx, p, http.MethodGet, chatID, map[string]string{"fields": "messages"}, nil, &list); err != nil {
		return nil, err
	}
	result := make([]Message, 0, len(list.Messages.Data))
	for _, item := range list.Messages.Data {
		var detail struct {
			ID      string `json:"id"`
			Created string `json:"created_time"`
			From    struct {
				ID       string `json:"id"`
				Username string `json:"username"`
			} `json:"from"`
			Text string `json:"message"`
		}
		if err := i.accountRequest(ctx, p, http.MethodGet, item.ID, map[string]string{"fields": "id,created_time,from,to,message"}, nil, &detail); err != nil {
			continue
		}
		created, _ := time.Parse(time.RFC3339, detail.Created)
		if created.IsZero() {
			created, _ = time.Parse("2006-01-02T15:04:05-0700", detail.Created)
		}
		result = append(result, Message{ID: detail.ID, ChatID: chatID, SenderID: detail.From.ID, SenderName: detail.From.Username, Text: detail.Text, CreatedAt: created})
	}
	return result, nil
}

func (i *instagramClient) syncEvents(ctx context.Context, profile store.InstagramProfile) error {
	var result struct {
		Cursor string `json:"cursor"`
		Events []struct {
			Payload string `json:"payload"`
		} `json:"events"`
	}
	if err := i.accountRequest(ctx, profile, http.MethodGet, "events", map[string]string{"after": profile.Cursor}, nil, &result); err != nil {
		return err
	}
	for _, item := range result.Events {
		var event struct {
			Sender struct {
				ID       string `json:"id"`
				Username string `json:"username"`
			} `json:"sender"`
			Timestamp int64 `json:"timestamp"`
			Message   struct {
				ID   string `json:"mid"`
				Text string `json:"text"`
			} `json:"message"`
		}
		if json.Unmarshal([]byte(item.Payload), &event) != nil || event.Message.ID == "" || event.Sender.ID == "" {
			continue
		}
		created := time.UnixMilli(event.Timestamp)
		message := Message{ID: event.Message.ID, ChatID: event.Sender.ID, SenderID: event.Sender.ID, SenderName: event.Sender.Username, Text: event.Message.Text, CreatedAt: created}
		chat := Chat{ID: event.Sender.ID, Name: event.Sender.Username, Avatar: initials(event.Sender.Username), LastText: event.Message.Text, LastTime: created.Format(time.RFC3339), Updated: created}
		if chat.Name == "" {
			chat.Name = event.Sender.ID
		}
		if err := store.SaveAppData(i.db, profile.ProfileID, chat, message); err != nil {
			return err
		}
	}
	if result.Cursor != "" && result.Cursor != profile.Cursor {
		profile.Cursor = result.Cursor
		return store.SaveInstagramProfile(i.db, profile)
	}
	return nil
}

func (i *instagramClient) send(ctx context.Context, chatID, text string) (Message, error) {
	p, err := i.activeProfile()
	if err != nil {
		return Message{}, err
	}
	body := map[string]any{"recipient": map[string]string{"id": chatID}, "message": map[string]string{"text": text}}
	var result struct {
		MessageID string `json:"message_id"`
	}
	if err = i.accountRequest(ctx, p, http.MethodPost, "messages", nil, body, &result); err != nil {
		return Message{}, err
	}
	return Message{ID: result.MessageID, ChatID: chatID, Text: text, Outgoing: true, CreatedAt: time.Now()}, nil
}

func (i *instagramClient) action(ctx context.Context, chatID, messageID, action, emoji string) error {
	p, err := i.activeProfile()
	if err != nil {
		return err
	}
	body := map[string]any{"recipient": map[string]string{"id": chatID}, "sender_action": action}
	if action == "react" {
		body["payload"] = map[string]string{"message_id": messageID, "reaction": emoji}
	}
	return i.accountRequest(ctx, p, http.MethodPost, "messages", nil, body, &struct{}{})
}

func (i *instagramClient) activeProfile() (store.InstagramProfile, error) {
	i.mu.RLock()
	id := i.active
	i.mu.RUnlock()
	for _, p := range store.InstagramProfiles(i.db) {
		if p.ProfileID == id {
			return p, nil
		}
	}
	return store.InstagramProfile{}, errors.New("Instagram profili aktif değil")
}

func (i *instagramClient) accountRequest(ctx context.Context, p store.InstagramProfile, method, path string, query map[string]string, body any, result any) error {
	return i.requestWithHeader(ctx, method, "/api/instagram/accounts/"+url.PathEscape(p.AccountID)+"/"+path, query, body, result)
}

func (i *instagramClient) request(ctx context.Context, method, path string, body any, result any) error {
	return i.requestWithHeader(ctx, method, path, nil, body, result)
}

func (i *instagramClient) requestWithHeader(ctx context.Context, method, path string, query map[string]string, body any, result any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, instagramRelay+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("X-Krio-Licence", i.license)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	values := req.URL.Query()
	for key, value := range query {
		values.Set(key, value)
	}
	req.URL.RawQuery = values.Encode()
	response, err := i.client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(response.Body, 8<<10))
		return fmt.Errorf("Instagram relay %s: %s", response.Status, strings.TrimSpace(string(data)))
	}
	return json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(result)
}
