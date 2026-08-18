package app

import (
	"context"
	"time"

	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
)

func (w *whatsApp) queueBulk(userID int64, profileID string, template BulkTemplate, mode string, rows []bulkSendRow) (BulkOperation, error) {
	if mode != "manual" {
		mode = "excel"
	}
	operationID, err := createOwnedBulkOperation(w.db, userID, profileID, template, mode, len(rows))
	if err != nil {
		return BulkOperation{}, err
	}
	go w.runBulk(operationID, profileID, template, rows)
	return bulkOperation(w.db, operationID)
}

func (w *whatsApp) runBulk(operationID int64, profileID string, template BulkTemplate, rows []bulkSendRow) {
	w.bulkMu.Lock()
	defer w.bulkMu.Unlock()
	ctx := context.Background()
	_ = startBulkOperation(w.db, operationID)
	client, err := w.profileClient(profileID)
	if err != nil {
		_ = finishBulkOperation(w.db, operationID, "failed", 0, len(rows))
		return
	}
	preference := profilePreferences(w.db)[profileID]
	if preference.TypingMin == 0 {
		preference.TypingMin, preference.TypingMax, preference.DelayMin, preference.DelayMax = 100, 200, 1000, 5000
	}
	for index, row := range rows {
		for !isWithinWorkHours(preference, time.Now()) {
			waitUntil := nextWorkWindowStart(preference, time.Now())
			select {
			case <-ctx.Done():
				_ = finishBulkOperation(w.db, operationID, "cancelled", successCount(w.db, operationID), index)
				return
			case <-time.After(time.Until(waitUntil)):
			}
		}
		recipient := row.Recipient
		text := templateVariable.ReplaceAllStringFunc(template.Body, func(match string) string { return row.Values[templateVariable.FindStringSubmatch(match)[1]] })
		jid, parseErr := parseChatID(recipient)
		item := bulkSendResult{ChatID: recipient}
		if parseErr != nil {
			item.Error = "geçersiz alıcı"
		} else {
			_ = client.SendChatPresence(ctx, jid, types.ChatPresenceComposing, types.ChatPresenceMediaText)
			if !waitContext(ctx, time.Duration(len([]rune(text))*randomBetween(preference.TypingMin, preference.TypingMax))*time.Millisecond) {
				_ = client.SendChatPresence(context.Background(), jid, types.ChatPresencePaused, types.ChatPresenceMediaText)
				_ = finishBulkOperation(w.db, operationID, "cancelled", successCount(w.db, operationID), index)
				return
			}
			_ = client.SendChatPresence(ctx, jid, types.ChatPresencePaused, types.ChatPresenceMediaText)
			if _, sendErr := client.SendMessage(ctx, jid, &waE2E.Message{Conversation: &text}); sendErr != nil {
				item.Error = sendErr.Error()
			}
		}
		_ = addBulkOperationItem(w.db, operationID, index+1, recipient, text, row.Values, item)
		if index < len(rows)-1 {
			select {
			case <-ctx.Done():
				_ = finishBulkOperation(w.db, operationID, "cancelled", successCount(w.db, operationID), index+1-successCount(w.db, operationID))
				return
			case <-time.After(time.Duration(randomBetween(preference.DelayMin, preference.DelayMax)) * time.Millisecond):
			}
		}
	}
	success := successCount(w.db, operationID)
	_ = finishBulkOperation(w.db, operationID, "completed", success, len(rows)-success)
}

func (w *whatsApp) bulkRecipients(profileID string) ([]Chat, error) {
	chats, err := loadChats(w.db, profileID)
	if err != nil {
		return nil, err
	}
	client, _ := w.profileClient(profileID)
	result := make([]Chat, 0, len(chats))
	for _, chat := range chats {
		if client != nil && chat.Name == "Bilinmeyen kişi" {
			if jid, parseErr := types.ParseJID(chat.ID); parseErr == nil {
				chat.Name = contactName(client, jid, chat.Name)
				chat.Avatar = initials(chat.Name)
			}
		}
		result = append(result, *chat)
	}
	return result, nil
}
