package app

import (
	"bytes"
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"krio-chat/backend/internal/app/license"
)

func TestUsersSessionsAndAccess(t *testing.T) {
	db, err := openAppStore(filepath.Join(t.TempDir(), "krio.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	admin, err := createUser(db, "admin", "password1", "admin", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	user, err := createUser(db, "operator", "password2", "user", []string{"p1"}, []int64{})
	if err != nil {
		t.Fatal(err)
	}
	if !canProfile(user, "p1") || canProfile(user, "p2") || !canProfile(admin, "p2") {
		t.Fatal("profile access is not enforced")
	}
	token, _, err := newSession(db, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	var stored string
	if err = db.QueryRow(`SELECT token_hash FROM krio_sessions`).Scan(&stored); err != nil || stored == token {
		t.Fatal("session token was not hashed")
	}
	got, err := sessionUser(db, token)
	if err != nil || got.ID != user.ID {
		t.Fatalf("session lookup failed: %#v %v", got, err)
	}
	if _, err = updateUser(db, admin.ID, admin.Username, "", "user", nil, nil); err == nil {
		t.Fatal("final admin demotion accepted")
	}
}

func TestReportOwnership(t *testing.T) {
	db, err := openAppStore(filepath.Join(t.TempDir(), "krio.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	template := BulkTemplate{ID: 1, Name: "Test", Body: "Hi"}
	id1, _ := createOwnedBulkOperation(db, 10, "p1", template, "manual", 1)
	_, _ = createOwnedBulkOperation(db, 20, "p1", template, "manual", 1)
	items, err := bulkOperationsForUser(db, appUser{ID: 10, Role: "user"})
	if err != nil || len(items) != 1 || items[0].ID != id1 {
		t.Fatalf("reports leaked: %#v %v", items, err)
	}
	if _, err = bulkOperationForUser(db, id1, appUser{ID: 20, Role: "user"}); err != sql.ErrNoRows {
		t.Fatalf("foreign report readable: %v", err)
	}
}

func TestLicenseResponses(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("unexpected method %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"valid":false,"reason":"expired","expiration_date":"2026-08-01"}`))
	}))
	defer server.Close()
	state, err := (license.Checker{URL: server.URL, Client: server.Client()}).Check(context.Background(), "KEY")
	if err != nil || !state.Expired || state.ExpirationDate != "2026-08-01" {
		t.Fatalf("expired license rejected: %#v %v", state, err)
	}
}

func TestProtectedRoutesRequireSession(t *testing.T) {
	db, err := openAppStore(filepath.Join(t.TempDir(), "krio.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = createUser(db, "admin", "password1", "admin", nil, nil); err != nil {
		t.Fatal(err)
	}
	s := &server{wa: &whatsApp{db: db}}
	handler := s.routes()
	request := httptest.NewRequest(http.MethodGet, "/api/users", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("protected route returned %d", response.Code)
	}
	s.setLicense(license.State{Error: "lisans bulunamadı"})
	request = httptest.NewRequest(http.MethodPost, "/api/login", bytes.NewBufferString(`{"username":"admin","password":"password1"}`))
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden || len(response.Result().Cookies()) != 0 {
		t.Fatalf("login accepted without license: %d %s", response.Code, response.Body.String())
	}
	s.setLicense(license.State{})
	request = httptest.NewRequest(http.MethodPost, "/api/login", bytes.NewBufferString(`{"username":"admin","password":"password1"}`))
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || len(response.Result().Cookies()) != 1 {
		t.Fatalf("login failed: %d %s", response.Code, response.Body.String())
	}
	request = httptest.NewRequest(http.MethodGet, "/api/users", nil)
	request.AddCookie(response.Result().Cookies()[0])
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("authenticated route returned %d", response.Code)
	}
}
