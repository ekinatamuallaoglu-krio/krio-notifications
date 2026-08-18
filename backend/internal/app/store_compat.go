package app

import (
	"database/sql"

	"krio-chat/backend/internal/store"
)

func openAppStore(database string) (*sql.DB, error) {
	db, err := store.OpenAppStore(database)
	if err == nil {
		err = initAccessStore(db)
	}
	return db, err
}

func claimLegacyData(db *sql.DB, profileID string) error { return store.ClaimLegacyData(db, profileID) }

func historyAnchors(db *sql.DB, profileID string) ([]historyAnchor, error) {
	items, err := store.HistoryAnchors(db, profileID)
	result := make([]historyAnchor, len(items))
	for i, item := range items {
		result[i] = historyAnchor{ID: item.ID, ChatID: item.ChatID, Outgoing: item.Outgoing, CreatedAt: item.CreatedAt}
	}
	return result, err
}

func loadChats(db *sql.DB, id string) (map[string]*Chat, error) { return store.LoadChats(db, id) }
func loadChat(db *sql.DB, profileID, chatID string) (*Chat, error) {
	return store.LoadChat(db, profileID, chatID)
}
func loadMessages(db *sql.DB, profileID, chatID string) ([]Message, error) {
	return store.LoadMessages(db, profileID, chatID)
}
func loadAppData(db *sql.DB, id string) (map[string]*Chat, map[string][]Message, error) {
	return store.LoadAppData(db, id)
}
func saveAppData(db *sql.DB, id string, chat Chat, message Message) error {
	return store.SaveAppData(db, id, chat, message)
}
func repairMessage(db *sql.DB, id string, message Message) error {
	return store.RepairMessage(db, id, message)
}
func deleteMessage(db *sql.DB, id, messageID string) error {
	return store.DeleteMessage(db, id, messageID)
}
func saveAppSnapshot(db *sql.DB, id string, chats map[string]*Chat, messages map[string][]Message) error {
	return store.SaveAppSnapshot(db, id, chats, messages)
}
func updateMessageReaction(db *sql.DB, p, c, m, r string) error {
	return store.UpdateMessageReaction(db, p, c, m, r)
}
func updateMessageStatus(db *sql.DB, p, c, m, s string) error {
	return store.UpdateMessageStatus(db, p, c, m, s)
}
func updateMessageMetadata(db *sql.DB, p, c, m string, v any) error {
	return store.UpdateMessageMetadata(db, p, c, m, v)
}
func clearUnread(db *sql.DB, p, c string) error { return store.ClearUnread(db, p, c) }
func clearAppData(db *sql.DB, p string) error   { return store.ClearAppData(db, p) }

func profilePreferences(db *sql.DB) map[string]profilePreference {
	items := store.ProfilePreferences(db)
	result := make(map[string]profilePreference, len(items))
	for id, item := range items {
		result[id] = profilePreference{Nickname: item.Nickname, Sound: item.Sound, Volume: item.Volume, TypingMin: item.TypingMin, TypingMax: item.TypingMax, DelayMin: item.DelayMin, DelayMax: item.DelayMax, WorkEnabled: item.WorkEnabled, WorkDays: item.WorkDays, WorkStart: item.WorkStart, WorkEnd: item.WorkEnd}
	}
	return result
}
func saveProfilePreference(db *sql.DB, profileID, nickname, sound string, volume, typingMin, typingMax, delayMin, delayMax, workEnabled int, workDays, workStart, workEnd string) error {
	return store.SaveProfilePreference(db, profileID, nickname, sound, volume, typingMin, typingMax, delayMin, delayMax, workEnabled, workDays, workStart, workEnd)
}

func profileUnread(db *sql.DB, id string) int          { return store.ProfileUnread(db, id) }
func profileUnreadCounts(db *sql.DB) map[string]int    { return store.ProfileUnreadCounts(db) }
func bulkTemplates(db *sql.DB) ([]BulkTemplate, error) { return store.BulkTemplates(db) }
func saveBulkTemplate(db *sql.DB, id int64, name, body string) (BulkTemplate, error) {
	return store.SaveBulkTemplate(db, id, name, body)
}
func deleteBulkTemplate(db *sql.DB, id int64) error { return store.DeleteBulkTemplate(db, id) }
func createBulkOperation(db *sql.DB, p string, t BulkTemplate, mode string, total int) (int64, error) {
	return store.CreateBulkOperation(db, p, t, mode, total)
}
func createOwnedBulkOperation(db *sql.DB, u int64, p string, t BulkTemplate, mode string, total int) (int64, error) {
	return store.CreateOwnedBulkOperation(db, u, p, t, mode, total)
}
func startBulkOperation(db *sql.DB, id int64) error { return store.StartBulkOperation(db, id) }
func addBulkOperationItem(db *sql.DB, id int64, row int, recipient, message string, values map[string]string, result bulkSendResult) error {
	return store.AddBulkOperationItem(db, id, row, recipient, message, values, store.BulkSendResult{ChatID: result.ChatID, Error: result.Error})
}
func finishBulkOperation(db *sql.DB, id int64, status string, success, failed int) error {
	return store.FinishBulkOperation(db, id, status, success, failed)
}
func bulkOperations(db *sql.DB) ([]BulkOperation, error) { return store.BulkOperations(db) }
func bulkOperationsForUser(db *sql.DB, user appUser) ([]BulkOperation, error) {
	return store.BulkOperationsForUser(db, store.User{ID: user.ID, Role: user.Role})
}
func bulkOperation(db *sql.DB, id int64) (BulkOperation, error) {
	return store.GetBulkOperation(db, id)
}
func bulkOperationForUser(db *sql.DB, id int64, user appUser) (BulkOperation, error) {
	return store.GetBulkOperationForUser(db, id, store.User{ID: user.ID, Role: user.Role})
}
