package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/appstate"
	waHistorySync "go.mau.fi/whatsmeow/proto/waHistorySync"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

func (w *whatsApp) saveBackgroundHistory(client *whatsmeow.Client, profileID string, event *events.HistorySync) {
	for _, conversation := range event.Data.GetConversations() {
		jid, err := types.ParseJID(conversation.GetID())
		if err != nil || ignoredChat(jid) {
			continue
		}
		chat, _ := loadChat(w.db, profileID, jid.String())
		if chat == nil {
			name := conversation.GetDisplayName()
			if name == "" {
				name = conversation.GetName()
			}
			if name == "" {
				name = contactName(client, jid, "Bilinmeyen kişi")
			}
			chat = &Chat{ID: jid.String(), Name: name, Avatar: initials(name)}
		}
		for _, history := range conversation.GetMessages() {
			parsed, parseErr := client.ParseWebMessage(jid, history.GetMessage())
			if parseErr != nil {
				continue
			}
			kind, text, mime, fileName, size, latitude, longitude, metadata := visibleMessage(parsed.Message)
			metadata = w.messageMetadata(parsed.Message, metadata)
			if kind == "" {
				continue
			}
			senderName := "Siz"
			if !parsed.Info.IsFromMe {
				senderName = contactName(client, parsed.Info.Sender, parsed.Info.PushName)
			}
			raw, _ := proto.Marshal(parsed.Message)
			message := Message{ID: string(parsed.Info.ID), ChatID: jid.String(), SenderID: parsed.Info.Sender.String(), SenderName: senderName, Text: strings.TrimSpace(text), Type: kind, Mime: mime, FileName: fileName, Size: size, Latitude: latitude, Longitude: longitude, Metadata: metadata, Outgoing: parsed.Info.IsFromMe, CreatedAt: parsed.Info.Timestamp, Raw: raw}
			if contextInfo := contextOf(parsed.Message); contextInfo != nil {
				message.ReplyToID = contextInfo.GetStanzaID()
				_, message.ReplyText, _, _, _, _, _, _ = visibleMessage(contextInfo.GetQuotedMessage())
				message.Forwarded = contextInfo.GetIsForwarded()
			}
			if message.CreatedAt.After(chat.Updated) {
				chat.Updated = message.CreatedAt
				chat.LastTime = message.CreatedAt.Format("15:04")
				chat.LastText = message.Text
			}
			if err = saveAppData(w.db, profileID, *chat, message); err != nil {
				log.Printf("arka plan geçmişi kaydedilemedi: %v", err)
			}
		}
	}
	w.broadcast("profiles", w.profiles())
}

func (w *whatsApp) syncStartup() {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	_ = w.client.FetchAppState(ctx, appstate.WAPatchCriticalUnblockLow, false, false)
	_ = w.client.FetchAppState(ctx, appstate.WAPatchRegularLow, true, false)
	w.broadcast("chats", w.chatList())
}

func (w *whatsApp) syncContacts(ctx context.Context, id string) error {
	client, err := w.profileClient(id)
	if err != nil {
		return err
	}
	if err = client.FetchAppState(ctx, appstate.WAPatchRegularLow, true, false); err != nil {
		return fmt.Errorf("kişiler eşitlenemedi: %w", err)
	}
	if w.profileID() == id {
		w.Lock()
		for _, chat := range w.chats {
			jid, parseErr := types.ParseJID(chat.ID)
			if parseErr == nil {
				chat.Name = w.localContactName(jid, chat.Name)
				chat.Avatar = initials(chat.Name)
			}
		}
		w.Unlock()
		w.broadcast("chats", w.chatList())
	}
	return nil
}

func (w *whatsApp) syncHistory(ctx context.Context, id string) error {
	client, err := w.profileClient(id)
	if err != nil {
		return err
	}
	w.historyMu.Lock()
	if w.historyWait == nil {
		w.historyWait = map[string]*historySyncWaiter{}
	}
	if _, running := w.historyWait[id]; running {
		w.historyMu.Unlock()
		return errors.New("geçmiş eşitleme zaten devam ediyor")
	}
	w.historyWait[id] = nil
	w.historyMu.Unlock()
	go w.runHistorySync(client, id)
	return nil
}

func (w *whatsApp) runHistorySync(client *whatsmeow.Client, id string) {
	defer func() {
		w.historyMu.Lock()
		delete(w.historyWait, id)
		w.historyMu.Unlock()
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	event := syncEvent{ProfileID: id}
	if err := w.syncContacts(ctx, id); err != nil {
		event.Error = err.Error()
	} else if err = w.syncAnchors(ctx, client, id); err != nil {
		event.Error = err.Error()
	}
	w.broadcast("sync", event)
}

func (w *whatsApp) syncAnchors(ctx context.Context, client *whatsmeow.Client, id string) error {
	anchors, err := historyAnchors(w.db, id)
	if err != nil {
		return fmt.Errorf("geçmiş hazırlanamadı: %w", err)
	}
	for _, anchor := range anchors {
		jid, parseErr := types.ParseJID(anchor.ChatID)
		if parseErr != nil {
			continue
		}
		waiter := &historySyncWaiter{chatID: jid.String(), done: make(chan struct{}, 1)}
		w.historyMu.Lock()
		w.historyWait[id] = waiter
		w.historyMu.Unlock()
		info := &types.MessageInfo{MessageSource: types.MessageSource{Chat: jid, IsFromMe: anchor.Outgoing, IsGroup: jid.Server == types.GroupServer}, ID: types.MessageID(anchor.ID), Timestamp: anchor.CreatedAt}
		if _, err = client.SendPeerMessage(ctx, client.BuildHistorySyncRequest(info, 50)); err != nil {
			return fmt.Errorf("geçmiş istenemedi: %w", err)
		}
		timer := time.NewTimer(90 * time.Second)
		select {
		case <-waiter.done:
			timer.Stop()
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
			return errors.New("WhatsApp geçmiş eşitleme isteğine yanıt vermedi")
		}
	}
	return nil
}

func (w *whatsApp) completeHistorySync(profileID string, event *events.HistorySync) {
	if event.Data == nil || event.Data.GetSyncType() != waHistorySync.HistorySync_ON_DEMAND {
		return
	}
	w.historyMu.Lock()
	defer w.historyMu.Unlock()
	waiter := w.historyWait[profileID]
	if waiter == nil {
		return
	}
	for _, conversation := range event.Data.GetConversations() {
		if jid, err := types.ParseJID(conversation.GetID()); err == nil && jid.String() == waiter.chatID {
			waiter.matched = true
		}
	}
	if event.Data.GetProgress() >= 100 && (waiter.matched || len(event.Data.GetConversations()) == 0) {
		select {
		case waiter.done <- struct{}{}:
		default:
		}
	}
}
