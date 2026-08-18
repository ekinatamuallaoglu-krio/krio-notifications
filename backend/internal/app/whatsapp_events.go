package app

import (
	"context"
	"log"
	"strings"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

func (w *whatsApp) handleBackgroundEvent(client *whatsmeow.Client, raw any) {
	profileID := client.Store.GetJID().String()
	switch event := raw.(type) {
	case *events.Connected:
		if client.Store.PushName != "" {
			_ = client.SendPresence(context.Background(), types.PresenceAvailable)
		}
		w.broadcast("profiles", w.profiles())
	case *events.HistorySync:
		w.saveBackgroundHistory(client, profileID, event)
		w.completeHistorySync(profileID, event)
	case *events.Message:
		if event.Info.IsFromMe || ignoredChat(event.Info.Chat) || event.Message.GetReactionMessage() != nil || event.Message.GetPollUpdateMessage() != nil {
			return
		}
		kind, text, mime, fileName, size, latitude, longitude, metadata := visibleMessage(event.Message)
		metadata = w.messageMetadata(event.Message, metadata)
		if kind == "" {
			return
		}
		text = strings.TrimSpace(text)
		senderName := event.Info.PushName
		if senderName == "" {
			senderName = "+" + event.Info.Sender.User
		}
		rawMessage, _ := proto.Marshal(event.Message)
		message := Message{ID: string(event.Info.ID), ChatID: event.Info.Chat.String(), SenderID: event.Info.Sender.String(), SenderName: senderName, Text: text, Type: kind, Mime: mime, FileName: fileName, Size: size, Latitude: latitude, Longitude: longitude, Metadata: metadata, CreatedAt: event.Info.Timestamp, Raw: rawMessage}
		chat := Chat{ID: message.ChatID, Name: senderName, Avatar: initials(senderName), LastText: text, LastTime: event.Info.Timestamp.Format("15:04"), Unread: 1, Updated: event.Info.Timestamp}
		if existing, err := loadChat(w.db, profileID, message.ChatID); err == nil && existing != nil {
			chat = *existing
			chat.Unread++
			chat.Updated = event.Info.Timestamp
			chat.LastTime = event.Info.Timestamp.Format("15:04")
			if text != "" {
				chat.LastText = text
			}
		}
		if err := saveAppData(w.db, profileID, chat, message); err != nil {
			log.Printf("arka plan mesajı kaydedilemedi: %v", err)
			return
		}
		w.broadcast("profileMessage", profileMessageEvent{ProfileID: profileID, Message: message})
		w.broadcast("profiles", w.profiles())
	}
}

func (w *whatsApp) handleEvent(raw interface{}) {
	switch event := raw.(type) {
	case *events.Connected:
		profileID := w.profileID()
		if profileID != "" {
			_ = claimLegacyData(w.db, profileID)
		}
		w.setStatus("connected", "", "")
		if w.client.Store.PushName != "" {
			if err := w.client.SendPresence(context.Background(), types.PresenceAvailable); err != nil {
				log.Printf("çevrimiçi durumu gönderilemedi: %v", err)
			}
		}
		w.startupSync.Do(func() { go w.syncStartup() })
		w.broadcast("profiles", w.profiles())
	case *events.Disconnected:
		w.setStatus("disconnected", "", "Bağlantı kesildi; yeniden bağlanılıyor")
	case *events.LoggedOut:
		go w.startPairing()
	case *events.Message:
		w.rememberEvent(event, true)
	case *events.Receipt:
		status := "delivered"
		if event.Type == types.ReceiptTypeRead || event.Type == types.ReceiptTypeReadSelf || event.Type == types.ReceiptTypePlayed {
			status = "read"
		}
		w.setMessageStatus(event.Chat.String(), event.MessageIDs, status)
	case *events.HistorySync:
		for _, conversation := range event.Data.GetConversations() {
			jid, err := types.ParseJID(conversation.GetID())
			if err != nil || ignoredChat(jid) {
				continue
			}
			w.Lock()
			if w.chats[jid.String()] == nil {
				name := conversation.GetDisplayName()
				if name == "" {
					name = conversation.GetName()
				}
				if name == "" {
					name = "Bilinmeyen kişi"
				}
				w.chats[jid.String()] = &Chat{ID: jid.String(), Name: name, Avatar: initials(name)}
			}
			w.Unlock()
			for _, history := range conversation.GetMessages() {
				message, err := w.client.ParseWebMessage(jid, history.GetMessage())
				if err == nil {
					w.rememberEvent(message, false)
				}
			}
			w.broadcast("chats", w.chatList())
		}
		w.completeHistorySync(w.profileID(), event)
	case *events.Pin:
		w.broadcast("chats", w.chatList())
	case *events.Contact, *events.PushName, *events.BusinessName:
		w.broadcast("chats", w.chatList())
	case *events.Presence:
		w.updatePresence(event.From, !event.Unavailable)
	case *events.ChatPresence:
		name := ""
		if event.Chat.Server == types.GroupServer {
			name = w.senderName(event.Sender, event.SenderAlt, "")
		}
		w.broadcast("typing", typingEvent{ChatID: event.Chat.String(), Name: name, Typing: event.State == types.ChatPresenceComposing && event.Media == types.ChatPresenceMediaText})
	}
}

func (w *whatsApp) rememberEvent(event *events.Message, notify bool, persist ...bool) {
	if reaction := event.Message.GetReactionMessage(); reaction != nil {
		if event.Info.IsFromMe {
			w.setReaction(event.Info.Chat.String(), reaction.GetKey().GetID(), reaction.GetText(), notify)
		}
		return
	}
	if update := event.Message.GetPollUpdateMessage(); update != nil {
		vote, err := w.client.DecryptPollVote(context.Background(), event)
		if err == nil {
			w.setPollVote(event.Info.Chat.String(), update.GetPollCreationMessageKey().GetID(), event.Info.Sender.String(), vote.GetSelectedOptions(), notify)
		}
		return
	}
	kind, text, mime, fileName, size, latitude, longitude, metadata := visibleMessage(event.Message)
	metadata = w.messageMetadata(event.Message, metadata)
	text = strings.TrimSpace(text)
	if kind == "" || ignoredChat(event.Info.Chat) {
		return
	}
	senderName := "Siz"
	if !event.Info.IsFromMe {
		senderName = w.senderName(event.Info.Sender, event.Info.SenderAlt, event.Info.PushName)
	}
	contextInfo := contextOf(event.Message)
	raw, _ := proto.Marshal(event.Message)
	message := Message{ID: string(event.Info.ID), ChatID: event.Info.Chat.String(), SenderID: event.Info.Sender.String(), SenderName: senderName, Text: text, Type: kind, Mime: mime, FileName: fileName, Size: size, Latitude: latitude, Longitude: longitude, Metadata: metadata, Outgoing: event.Info.IsFromMe, CreatedAt: event.Info.Timestamp, Raw: raw}
	if contextInfo != nil {
		message.ReplyToID = contextInfo.GetStanzaID()
		_, message.ReplyText, _, _, _, _, _, _ = visibleMessage(contextInfo.GetQuotedMessage())
		message.Forwarded = contextInfo.GetIsForwarded()
	}
	w.remember(message, event.Info.PushName, notify, len(persist) == 0 || persist[0])
}
