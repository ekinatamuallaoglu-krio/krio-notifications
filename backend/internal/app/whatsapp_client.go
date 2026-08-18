package app

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"math/rand/v2"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/skip2/go-qrcode"
	"go.mau.fi/whatsmeow"
	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"

	appstore "krio-chat/backend/internal/store"
	wahelpers "krio-chat/backend/internal/whatsapp"
)

func newWhatsApp(ctx context.Context) (*whatsApp, error) {
	database := os.Getenv("KRIO_DATABASE")
	if database == "" {
		database = "krio.db"
		if cwd, _ := os.Getwd(); filepath.Base(cwd) == "backend" {
			database = filepath.Join("..", database)
		}
	}
	db, err := appstore.OpenAppStore(database)
	if err != nil {
		return nil, err
	}
	if err = initAccessStore(db); err != nil {
		db.Close()
		return nil, err
	}
	container, err := sqlstore.New(ctx, "sqlite3", "file:"+database+"?_foreign_keys=on&_busy_timeout=5000", nil)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("WhatsApp oturumu açılamadı: %w", err)
	}
	devices, err := container.GetAllDevices(ctx)
	if err != nil {
		container.Close()
		db.Close()
		return nil, err
	}
	if len(devices) == 0 {
		devices = []*store.Device{container.NewDevice()}
	}
	device := devices[0]
	profileID := device.GetJID().String()
	if profileID != "" {
		_ = appstore.ClaimLegacyData(db, profileID)
	}
	chats, err := appstore.LoadChats(db, profileID)
	if err != nil {
		container.Close()
		db.Close()
		return nil, fmt.Errorf("kayıtlı mesajlar yüklenemedi: %w", err)
	}
	w := &whatsApp{container: container, db: db, status: authStatus{State: "starting"}, chats: chats, messages: map[string][]Message{}, listeners: map[chan streamEvent]struct{}{}}
	for _, stored := range devices {
		w.useDevice(stored, stored == device)
	}
	return w, nil
}

func (w *whatsApp) useDevice(device *store.Device, active bool) *whatsmeow.Client {
	client := whatsmeow.NewClient(device, nil)
	client.EnableAutoReconnect = true
	client.AddEventHandler(func(event any) {
		if w.isActive(client) {
			w.handleEvent(event)
			return
		}
		w.handleBackgroundEvent(client, event)
	})
	w.clients = append(w.clients, client)
	if active {
		w.client = client
	}
	return client
}

func (w *whatsApp) clientFor(id string) *whatsmeow.Client {
	for _, client := range w.clients {
		if client.Store.GetJID().String() == id {
			return client
		}
	}
	return nil
}

func (w *whatsApp) isActive(client *whatsmeow.Client) bool {
	w.RLock()
	defer w.RUnlock()
	return w.client == client
}

func (w *whatsApp) connect(client *whatsmeow.Client) {
	w.connectMu.Lock()
	defer w.connectMu.Unlock()
	if client.IsConnected() {
		return
	}
	if client.Store.ID == nil {
		qr, err := client.GetQRChannel(context.Background())
		if err != nil {
			w.setStatus("error", "", err.Error())
			return
		}
		go func() {
			for item := range qr {
				if item.Event == whatsmeow.QRChannelEventCode && w.isActive(client) {
					png, err := qrcode.Encode(item.Code, qrcode.Medium, 320)
					if err == nil {
						w.setStatus("qr", "data:image/png;base64,"+base64.StdEncoding.EncodeToString(png), "")
					}
				} else if item.Event == whatsmeow.QRChannelEventError && w.isActive(client) {
					w.setStatus("error", "", item.Error.Error())
				}
			}
		}()
	} else if w.isActive(client) {
		w.setStatus("connecting", "", "")
	}
	if err := client.Connect(); err != nil {
		if w.isActive(client) {
			w.setStatus("error", "", err.Error())
		}
	}
}

func (w *whatsApp) connectAll() {
	w.RLock()
	clients := append([]*whatsmeow.Client(nil), w.clients...)
	w.RUnlock()
	for _, client := range clients {
		go w.connect(client)
	}
}

func textOf(message *waE2E.Message) string {
	return wahelpers.TextOf(message)
}

func contextOf(message *waE2E.Message) *waE2E.ContextInfo {
	message = unwrapMessage(message)
	switch {
	case message.GetExtendedTextMessage() != nil:
		return message.GetExtendedTextMessage().GetContextInfo()
	case message.GetImageMessage() != nil:
		return message.GetImageMessage().GetContextInfo()
	case message.GetVideoMessage() != nil:
		return message.GetVideoMessage().GetContextInfo()
	case message.GetPtvMessage() != nil:
		return message.GetPtvMessage().GetContextInfo()
	case message.GetAudioMessage() != nil:
		return message.GetAudioMessage().GetContextInfo()
	case message.GetDocumentMessage() != nil:
		return message.GetDocumentMessage().GetContextInfo()
	case message.GetStickerMessage() != nil:
		return message.GetStickerMessage().GetContextInfo()
	case message.GetLocationMessage() != nil:
		return message.GetLocationMessage().GetContextInfo()
	case message.GetLiveLocationMessage() != nil:
		return message.GetLiveLocationMessage().GetContextInfo()
	case message.GetContactMessage() != nil:
		return message.GetContactMessage().GetContextInfo()
	case message.GetContactsArrayMessage() != nil:
		return message.GetContactsArrayMessage().GetContextInfo()
	case message.GetPollCreationMessage() != nil:
		return message.GetPollCreationMessage().GetContextInfo()
	case message.GetPollCreationMessageV2() != nil:
		return message.GetPollCreationMessageV2().GetContextInfo()
	case message.GetPollCreationMessageV3() != nil:
		return message.GetPollCreationMessageV3().GetContextInfo()
	case message.GetPollCreationMessageV5() != nil:
		return message.GetPollCreationMessageV5().GetContextInfo()
	case message.GetPollCreationMessageV6() != nil:
		return message.GetPollCreationMessageV6().GetContextInfo()
	case message.GetEventMessage() != nil:
		return message.GetEventMessage().GetContextInfo()
	case message.GetGroupInviteMessage() != nil:
		return message.GetGroupInviteMessage().GetContextInfo()
	case message.GetListResponseMessage() != nil:
		return message.GetListResponseMessage().GetContextInfo()
	case message.GetButtonsResponseMessage() != nil:
		return message.GetButtonsResponseMessage().GetContextInfo()
	case message.GetTemplateButtonReplyMessage() != nil:
		return message.GetTemplateButtonReplyMessage().GetContextInfo()
	case message.GetInteractiveResponseMessage() != nil:
		return message.GetInteractiveResponseMessage().GetContextInfo()
	}
	return nil
}

func pollMetadata(poll *waE2E.PollCreationMessage) map[string]any {
	return wahelpers.PollMetadata(poll)
}

func (w *whatsApp) setPollVote(chatID, messageID, senderID string, selected [][]byte, notify bool) {
	w.Lock()
	var updated Message
	for index := range w.messages[chatID] {
		message := &w.messages[chatID][index]
		if message.ID != messageID || message.Type != "poll" {
			continue
		}
		metadata, _ := message.Metadata.(map[string]any)
		options, _ := metadata["options"].([]string)
		if options == nil {
			if raw, ok := metadata["options"].([]any); ok {
				for _, option := range raw {
					options = append(options, fmt.Sprint(option))
				}
			}
		}
		votes, _ := metadata["votes"].(map[string]any)
		if votes == nil {
			votes = map[string]any{}
		}
		chosen := []string{}
		for _, hash := range selected {
			for _, option := range options {
				candidate := whatsmeow.HashPollOptions([]string{option})[0]
				if string(candidate) == string(hash) {
					chosen = append(chosen, option)
				}
			}
		}
		votes[senderID] = chosen
		metadata["votes"] = votes
		message.Metadata = metadata
		updated = *message
		break
	}
	w.Unlock()
	if updated.ID == "" {
		return
	}
	_ = updateMessageMetadata(w.db, w.profileID(), chatID, messageID, updated.Metadata)
	if notify {
		w.broadcast("messageUpdate", updated)
	}
}

func (w *whatsApp) remember(message Message, pushName string, notify, persist bool) {
	w.Lock()
	for _, existing := range w.messages[message.ChatID] {
		if existing.ID == message.ID {
			w.Unlock()
			return
		}
	}
	chat := w.chats[message.ChatID]
	if chat == nil {
		jid, _ := types.ParseJID(message.ChatID)
		name := w.contactName(jid, pushName)
		chat = &Chat{ID: message.ChatID, Name: name, Avatar: initials(name)}
		w.chats[message.ChatID] = chat
	}
	if !message.Outgoing && !strings.HasSuffix(message.ChatID, "@g.us") {
		message.SenderName = chat.Name
	}
	if message.CreatedAt.After(chat.Updated) {
		preview := message.Text
		if preview == "" {
			preview = map[string]string{"image": "📷 Fotoğraf", "video": "🎬 Video", "audio": "🎵 Ses", "document": "📎 Belge", "sticker": "Etiket", "location": "📍 Konum", "contact": "👤 Kişi", "poll": "📊 Anket"}[message.Type]
		}
		chat.LastText, chat.LastTime, chat.Updated = preview, message.CreatedAt.Format("15:04"), message.CreatedAt
	}
	if notify && !message.Outgoing {
		chat.Unread++
	}
	w.messages[message.ChatID] = append(w.messages[message.ChatID], message)
	sort.SliceStable(w.messages[message.ChatID], func(i, j int) bool {
		return w.messages[message.ChatID][i].CreatedAt.Before(w.messages[message.ChatID][j].CreatedAt)
	})
	if len(w.messages[message.ChatID]) > 200 {
		w.messages[message.ChatID] = w.messages[message.ChatID][len(w.messages[message.ChatID])-200:]
	}
	storedChat := *chat
	w.Unlock()
	if persist {
		if err := saveAppData(w.db, w.profileID(), storedChat, message); err != nil {
			log.Printf("mesaj kaydedilemedi: %v", err)
		}
	}
	if notify {
		w.broadcast("message", message)
		w.broadcast("chats", w.chatList())
		w.broadcast("profiles", w.profiles())
	}
}

func initials(name string) string {
	parts := strings.Fields(name)
	if len(parts) == 0 {
		return "?"
	}
	result := []rune(parts[0])[:1]
	if len(parts) > 1 {
		result = append(result, []rune(parts[len(parts)-1])[:1]...)
	}
	return strings.ToUpper(string(result))
}

func successCount(db *sql.DB, operationID int64) int {
	var count int
	_ = db.QueryRow(`SELECT COUNT(*) FROM krio_bulk_operation_items WHERE operation_id=? AND status='success'`, operationID).Scan(&count)
	return count
}

func randomBetween(minimum, maximum int) int {
	if maximum <= minimum {
		return minimum
	}
	return minimum + rand.IntN(maximum-minimum+1)
}

func waitContext(ctx context.Context, duration time.Duration) bool {
	select {
	case <-ctx.Done():
		return false
	case <-time.After(duration):
		return true
	}
}

func (w *whatsApp) react(ctx context.Context, chatID, messageID, reaction string) error {
	chat, err := types.ParseJID(chatID)
	if err != nil {
		return errors.New("geçersiz sohbet")
	}
	target, ok := w.findMessage(chatID, messageID)
	if !ok {
		return errors.New("mesaj bulunamadı")
	}
	sender, _ := types.ParseJID(target.SenderID)
	if target.Outgoing {
		sender = types.EmptyJID
	}
	if _, err = w.client.SendMessage(ctx, chat, w.client.BuildReaction(chat, sender, types.MessageID(messageID), reaction)); err != nil {
		return fmt.Errorf("reaksiyon gönderilemedi: %w", err)
	}
	w.setReaction(chatID, messageID, reaction, true)
	return nil
}

func (w *whatsApp) markRead(ctx context.Context, chatID string) error {
	chat, err := types.ParseJID(chatID)
	if err != nil {
		return errors.New("geçersiz sohbet")
	}
	w.Lock()
	current := w.chats[chatID]
	if current == nil || current.Unread == 0 {
		w.Unlock()
		return nil
	}
	unread := current.Unread
	list := append([]Message(nil), w.messages[chatID]...)
	w.Unlock()
	bySender := map[string][]Message{}
	for index := len(list) - 1; index >= 0 && unread > 0; index-- {
		if list[index].Outgoing {
			continue
		}
		bySender[list[index].SenderID] = append(bySender[list[index].SenderID], list[index])
		unread--
	}
	for senderID, messages := range bySender {
		sender, _ := types.ParseJID(senderID)
		ids := make([]types.MessageID, len(messages))
		for index, message := range messages {
			ids[index] = types.MessageID(message.ID)
		}
		if err = w.client.MarkRead(ctx, ids, messages[0].CreatedAt, chat, sender); err != nil {
			return fmt.Errorf("okundu bilgisi gönderilemedi: %w", err)
		}
	}
	w.Lock()
	if current = w.chats[chatID]; current != nil {
		current.Unread = 0
	}
	w.Unlock()
	if err = clearUnread(w.db, w.profileID(), chatID); err != nil {
		return err
	}
	w.broadcast("chats", w.chatList())
	w.broadcast("profiles", w.profiles())
	return nil
}

func (w *whatsApp) auth() authStatus { w.RLock(); defer w.RUnlock(); return w.status }

func (w *whatsApp) setStatus(state, qr, message string) {
	w.Lock()
	w.status = authStatus{State: state, QR: qr, Error: message}
	status := w.status
	w.Unlock()
	w.broadcast("auth", status)
}

func (w *whatsApp) subscribe() chan streamEvent {
	listener := make(chan streamEvent, 16)
	w.Lock()
	w.listeners[listener] = struct{}{}
	w.Unlock()
	return listener
}

func (w *whatsApp) unsubscribe(listener chan streamEvent) {
	w.Lock()
	delete(w.listeners, listener)
	w.Unlock()
}

func (w *whatsApp) broadcast(kind string, payload interface{}) {
	w.RLock()
	defer w.RUnlock()
	for listener := range w.listeners {
		select {
		case listener <- streamEvent{Type: kind, Payload: payload}:
		default:
		}
	}
}

func (w *whatsApp) close() {
	w.RLock()
	clients := append([]*whatsmeow.Client(nil), w.clients...)
	w.RUnlock()
	for _, client := range clients {
		if client.IsConnected() {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			_ = client.SendPresence(ctx, types.PresenceUnavailable)
			cancel()
		}
		client.Disconnect()
	}
	_ = w.container.Close()
	_ = w.db.Close()
}
