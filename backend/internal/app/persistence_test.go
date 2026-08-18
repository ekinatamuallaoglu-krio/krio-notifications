package app

import (
	"path/filepath"
	"testing"
	"time"
)

func TestAppDataPersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "krio.db")
	db, err := openAppStore(path)
	if err != nil {
		t.Fatal(err)
	}
	created := time.Date(2026, 8, 14, 12, 30, 0, 0, time.UTC)
	message := Message{ID: "message-1", ChatID: "905551112233@s.whatsapp.net", SenderID: "905551112233@s.whatsapp.net", SenderName: "Ayşe", Text: "Nerede?", Type: "location", Latitude: 41.01, Longitude: 28.97, Metadata: map[string]any{"name": "İstanbul"}, Raw: []byte{1, 2, 3}, ReplyToID: "message-0", ReplyText: "Önceki mesaj", Reaction: "👍", Forwarded: true, Outgoing: true, Status: "delivered", CreatedAt: created}
	chat := Chat{ID: message.ChatID, Name: "Ayşe", LastText: message.Text, Unread: 3, Updated: created}
	if err = saveAppData(db, "profile-a", chat, message); err != nil {
		t.Fatal(err)
	}
	db.Close()

	db, err = openAppStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	chats, messages, err := loadAppData(db, "profile-a")
	if err != nil {
		t.Fatal(err)
	}
	if chats[chat.ID].LastText != "Nerede?" || chats[chat.ID].Unread != 3 || len(messages[chat.ID]) != 1 || messages[chat.ID][0].SenderName != "Ayşe" {
		t.Fatalf("unexpected restored data: %#v %#v", chats, messages)
	}
	restored := messages[chat.ID][0]
	if restored.SenderID != message.SenderID || restored.ReplyToID != message.ReplyToID || restored.ReplyText != message.ReplyText || restored.Reaction != "👍" || !restored.Forwarded {
		t.Fatalf("message actions were not restored: %#v", restored)
	}
	if restored.Type != "location" || restored.Latitude != 41.01 || restored.Longitude != 28.97 || string(restored.Raw) != string(message.Raw) {
		t.Fatalf("rich message was not restored: %#v", restored)
	}
	if restored.Status != "delivered" || profileUnread(db, "profile-a") != 3 {
		t.Fatalf("status or profile unread count was not restored: %#v", restored)
	}
	otherChats, _, err := loadAppData(db, "profile-b")
	if err != nil || len(otherChats) != 0 {
		t.Fatalf("profile data leaked: %#v %v", otherChats, err)
	}
	summaries, err := loadChats(db, "profile-a")
	if err != nil || len(summaries) != 1 {
		t.Fatalf("chat summaries were not loaded: %#v %v", summaries, err)
	}
	lazyMessages, err := loadMessages(db, "profile-a", chat.ID)
	if err != nil || len(lazyMessages) != 1 || lazyMessages[0].ID != message.ID {
		t.Fatalf("messages were not loaded lazily: %#v %v", lazyMessages, err)
	}
	emptyMessages, err := loadMessages(db, "profile-a", "empty@s.whatsapp.net")
	if err != nil || emptyMessages == nil || len(emptyMessages) != 0 {
		t.Fatalf("empty message list must be a loaded empty slice: %#v %v", emptyMessages, err)
	}
	loadedChat, err := loadChat(db, "profile-a", chat.ID)
	if err != nil || loadedChat == nil || loadedChat.Unread != 3 {
		t.Fatalf("single chat summary was not loaded: %#v %v", loadedChat, err)
	}
}

func TestHistorySnapshotOnlyAddsMissingMessages(t *testing.T) {
	db, err := openAppStore(filepath.Join(t.TempDir(), "krio.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	chatID := "905551112233@s.whatsapp.net"
	newer := Message{ID: "new", ChatID: chatID, Text: "Yeni", CreatedAt: time.Unix(200, 0)}
	chat := Chat{ID: chatID, Name: "Ayşe", LastText: newer.Text, Updated: newer.CreatedAt}
	if err = saveAppData(db, "profile-a", chat, newer); err != nil {
		t.Fatal(err)
	}
	older := Message{ID: "old", ChatID: chatID, Text: "Eski", CreatedAt: time.Unix(100, 0)}
	if err = saveAppSnapshot(db, "profile-a", map[string]*Chat{chatID: &chat}, map[string][]Message{chatID: {newer, older, newer}}); err != nil {
		t.Fatal(err)
	}
	messages, err := loadMessages(db, "profile-a", chatID)
	if err != nil || len(messages) != 2 {
		t.Fatalf("history merge failed: %#v %v", messages, err)
	}
	anchors, err := historyAnchors(db, "profile-a")
	if err != nil || len(anchors) != 1 || anchors[0].ID != "old" {
		t.Fatalf("wrong history anchor: %#v %v", anchors, err)
	}
}

func TestProfilePreferencesPersistAndClear(t *testing.T) {
	db, err := openAppStore(filepath.Join(t.TempDir(), "krio.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = saveProfilePreference(db, "profile-a", "İş", "bell", 35, 120, 180, 2000, 4000, 1, "1,2,3,4,5", "09:00", "18:00"); err != nil {
		t.Fatal(err)
	}
	preference := profilePreferences(db)["profile-a"]
	if preference.Nickname != "İş" || preference.Sound != "bell" || preference.Volume != 35 || preference.TypingMin != 120 || preference.DelayMax != 4000 {
		t.Fatalf("profile preferences were not saved: %#v", preference)
	}
	if err = clearAppData(db, "profile-a"); err != nil {
		t.Fatal(err)
	}
	if _, exists := profilePreferences(db)["profile-a"]; exists {
		t.Fatal("profile preferences were not cleared")
	}
}

func TestBulkTemplatePersists(t *testing.T) {
	db, err := openAppStore(filepath.Join(t.TempDir(), "krio.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	item, err := saveBulkTemplate(db, 0, "Karşılama", "Merhaba {{ad}}")
	if err != nil {
		t.Fatal(err)
	}
	items, err := bulkTemplates(db)
	if err != nil || len(items) != 1 || items[0].Body != item.Body {
		t.Fatalf("template not restored: %#v %v", items, err)
	}
	if _, err = saveBulkTemplate(db, item.ID, "Karşılama", "Selam {{ad}}"); err != nil {
		t.Fatal(err)
	}
	items, _ = bulkTemplates(db)
	if len(items) != 1 || items[0].Body != "Selam {{ad}}" {
		t.Fatalf("template not Updated: %#v", items)
	}
	if err = deleteBulkTemplate(db, item.ID); err != nil {
		t.Fatal(err)
	}
}

func TestBulkOperationPersists(t *testing.T) {
	db, err := openAppStore(filepath.Join(t.TempDir(), "krio.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	template := BulkTemplate{ID: 7, Name: "Hatırlatma", Body: "Merhaba {{ad}}"}
	id, err := createBulkOperation(db, "profile-a", template, "excel", 2)
	if err != nil {
		t.Fatal(err)
	}
	if err = startBulkOperation(db, id); err != nil {
		t.Fatal(err)
	}
	if err = addBulkOperationItem(db, id, 1, "90555@s.whatsapp.net", "Merhaba Ayşe", map[string]string{"ad": "Ayşe"}, bulkSendResult{ChatID: "90555@s.whatsapp.net"}); err != nil {
		t.Fatal(err)
	}
	if report, readErr := bulkOperation(db, id); readErr != nil || report.Status != "running" || report.Success != 1 || report.Failed != 0 {
		t.Fatalf("running counters not Updated: %#v %v", report, readErr)
	}
	if err = addBulkOperationItem(db, id, 2, "invalid", "Merhaba Ali", map[string]string{"ad": "Ali"}, bulkSendResult{ChatID: "invalid", Error: "geçersiz alıcı"}); err != nil {
		t.Fatal(err)
	}
	if err = finishBulkOperation(db, id, "completed", 1, 1); err != nil {
		t.Fatal(err)
	}
	report, err := bulkOperation(db, id)
	if err != nil || report.TemplateName != template.Name || report.Success != 1 || len(report.Items) != 2 || report.Items[0].Values["ad"] != "Ayşe" || report.Items[1].Error == "" {
		t.Fatalf("unexpected report: %#v %v", report, err)
	}
	reports, err := bulkOperations(db)
	if err != nil || len(reports) != 1 || reports[0].ID != id {
		t.Fatalf("unexpected reports: %#v %v", reports, err)
	}
}
