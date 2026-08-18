package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"

	"go.mau.fi/whatsmeow"
	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

func visibleMessage(message *waE2E.Message) (kind, text, mime, fileName string, size uint64, latitude, longitude float64, metadata any) {
	if unwrapped := unwrapMessage(message); unwrapped != message {
		return visibleMessage(unwrapped)
	}
	switch {
	case message.GetConversation() != "" || message.GetExtendedTextMessage() != nil:
		return "text", textOf(message), "", "", 0, 0, 0, nil
	case message.GetImageMessage() != nil:
		m := message.GetImageMessage()
		return "image", m.GetCaption(), m.GetMimetype(), "", m.GetFileLength(), 0, 0, nil
	case message.GetPtvMessage() != nil:
		m := message.GetPtvMessage()
		return "video", m.GetCaption(), m.GetMimetype(), "", m.GetFileLength(), 0, 0, map[string]any{"ptv": true}
	case message.GetVideoMessage() != nil:
		m := message.GetVideoMessage()
		return "video", m.GetCaption(), m.GetMimetype(), "", m.GetFileLength(), 0, 0, map[string]any{"gif": m.GetGifPlayback()}
	case message.GetAudioMessage() != nil:
		m := message.GetAudioMessage()
		return "audio", "", m.GetMimetype(), "", m.GetFileLength(), 0, 0, map[string]any{"voice": m.GetPTT(), "seconds": m.GetSeconds()}
	case message.GetDocumentMessage() != nil:
		m := message.GetDocumentMessage()
		return "document", m.GetCaption(), m.GetMimetype(), m.GetFileName(), m.GetFileLength(), 0, 0, map[string]any{"pages": m.GetPageCount()}
	case message.GetStickerMessage() != nil:
		m := message.GetStickerMessage()
		return "sticker", "", m.GetMimetype(), "", m.GetFileLength(), 0, 0, nil
	case message.GetLocationMessage() != nil:
		m := message.GetLocationMessage()
		return "location", m.GetComment(), "", "", 0, m.GetDegreesLatitude(), m.GetDegreesLongitude(), map[string]any{"name": m.GetName(), "address": m.GetAddress(), "url": m.GetURL(), "live": m.GetIsLive()}
	case message.GetLiveLocationMessage() != nil:
		m := message.GetLiveLocationMessage()
		return "location", m.GetCaption(), "", "", 0, m.GetDegreesLatitude(), m.GetDegreesLongitude(), map[string]any{"live": true}
	case message.GetContactMessage() != nil:
		m := message.GetContactMessage()
		return "contact", m.GetDisplayName(), "text/vcard", "", 0, 0, 0, map[string]any{"contacts": []map[string]string{{"name": m.GetDisplayName(), "vcard": m.GetVcard()}}}
	case message.GetContactsArrayMessage() != nil:
		m := message.GetContactsArrayMessage()
		contacts := make([]map[string]string, 0, len(m.GetContacts()))
		for _, contact := range m.GetContacts() {
			contacts = append(contacts, map[string]string{"name": contact.GetDisplayName(), "vcard": contact.GetVcard()})
		}
		return "contact", m.GetDisplayName(), "", "", 0, 0, 0, map[string]any{"contacts": contacts}
	case message.GetPollCreationMessage() != nil:
		m := message.GetPollCreationMessage()
		return "poll", m.GetName(), "", "", 0, 0, 0, pollMetadata(m)
	case message.GetPollCreationMessageV2() != nil:
		m := message.GetPollCreationMessageV2()
		return "poll", m.GetName(), "", "", 0, 0, 0, pollMetadata(m)
	case message.GetPollCreationMessageV3() != nil:
		m := message.GetPollCreationMessageV3()
		return "poll", m.GetName(), "", "", 0, 0, 0, pollMetadata(m)
	case message.GetPollCreationMessageV5() != nil:
		m := message.GetPollCreationMessageV5()
		return "poll", m.GetName(), "", "", 0, 0, 0, pollMetadata(m)
	case message.GetPollCreationMessageV6() != nil:
		m := message.GetPollCreationMessageV6()
		return "poll", m.GetName(), "", "", 0, 0, 0, pollMetadata(m)
	case message.GetEventMessage() != nil:
		m := message.GetEventMessage()
		return "event", m.GetName(), "", "", 0, 0, 0, map[string]any{"description": m.GetDescription(), "start": m.GetStartTime(), "end": m.GetEndTime(), "joinLink": m.GetJoinLink(), "canceled": m.GetIsCanceled()}
	case message.GetEventInviteMessage() != nil:
		m := message.GetEventInviteMessage()
		return "event", m.GetEventTitle(), "", "", 0, 0, 0, map[string]any{"start": m.GetStartTime(), "end": m.GetEndTime(), "joinLink": m.GetCallLink(), "canceled": m.GetIsCanceled()}
	case message.GetGroupInviteMessage() != nil:
		m := message.GetGroupInviteMessage()
		return "invite", m.GetCaption(), "", "", 0, 0, 0, map[string]any{"name": m.GetGroupName(), "code": m.GetInviteCode()}
	case message.GetTemplateButtonReplyMessage() != nil:
		return "response", message.GetTemplateButtonReplyMessage().GetSelectedDisplayText(), "", "", 0, 0, 0, nil
	case message.GetButtonsResponseMessage() != nil:
		return "response", message.GetButtonsResponseMessage().GetSelectedDisplayText(), "", "", 0, 0, 0, nil
	case message.GetListResponseMessage() != nil:
		m := message.GetListResponseMessage()
		return "response", m.GetTitle(), "", "", 0, 0, 0, map[string]any{"description": m.GetDescription()}
	case message.GetInteractiveResponseMessage() != nil:
		return "response", message.GetInteractiveResponseMessage().GetBody().GetText(), "", "", 0, 0, 0, nil
	case message.GetOrderMessage() != nil:
		m := message.GetOrderMessage()
		return "order", m.GetOrderTitle(), "", "", 0, 0, 0, map[string]any{"items": m.GetItemCount(), "currency": m.GetTotalCurrencyCode(), "amount1000": m.GetTotalAmount1000()}
	case message.GetProductMessage() != nil:
		m := message.GetProductMessage()
		return "product", m.GetBody(), "", "", 0, 0, 0, map[string]any{"footer": m.GetFooter()}
	case message.GetScheduledCallCreationMessage() != nil:
		m := message.GetScheduledCallCreationMessage()
		return "call", m.GetTitle(), "", "", 0, 0, 0, map[string]any{"start": m.GetScheduledTimestampMS()}
	case message.GetCallLogMesssage() != nil:
		m := message.GetCallLogMesssage()
		return "call", "Arama", "", "", 0, 0, 0, map[string]any{"video": m.GetIsVideo(), "duration": m.GetDurationSecs(), "outcome": m.GetCallOutcome().String()}
	}
	if text := reflectedMessageText(message.ProtoReflect(), 0); text != "" {
		return "text", text, "", "", 0, 0, 0, nil
	}
	return "", "", "", "", 0, 0, 0, nil
}

func unwrapMessage(message *waE2E.Message) *waE2E.Message {
	for depth := 0; message != nil && depth < 4; depth++ {
		var nested *waE2E.Message
		switch {
		case message.GetDeviceSentMessage() != nil:
			nested = message.GetDeviceSentMessage().GetMessage()
		case message.GetEphemeralMessage() != nil:
			nested = message.GetEphemeralMessage().GetMessage()
		case message.GetViewOnceMessage() != nil:
			nested = message.GetViewOnceMessage().GetMessage()
		case message.GetViewOnceMessageV2() != nil:
			nested = message.GetViewOnceMessageV2().GetMessage()
		case message.GetViewOnceMessageV2Extension() != nil:
			nested = message.GetViewOnceMessageV2Extension().GetMessage()
		case message.GetDocumentWithCaptionMessage() != nil:
			nested = message.GetDocumentWithCaptionMessage().GetMessage()
		case message.GetEditedMessage() != nil:
			nested = message.GetEditedMessage().GetMessage()
		default:
			return message
		}
		if nested == nil {
			return message
		}
		message = nested
	}
	return message
}

func reflectedMessageText(message protoreflect.Message, depth int) string {
	if depth > 3 {
		return ""
	}
	fields := message.Descriptor().Fields()
	for index := 0; index < fields.Len(); index++ {
		field := fields.Get(index)
		if !message.Has(field) {
			continue
		}
		name := strings.ToLower(string(field.Name()))
		value := message.Get(field)
		if field.Kind() == protoreflect.StringKind && (strings.Contains(name, "text") || strings.Contains(name, "conversation") || strings.Contains(name, "caption") || name == "body") {
			if text := value.String(); text != "" {
				return text
			}
		}
		if field.Kind() == protoreflect.MessageKind && !field.IsList() && !field.IsMap() {
			if text := reflectedMessageText(value.Message(), depth+1); text != "" {
				return text
			}
		}
	}
	return ""
}

func (w *whatsApp) setMessageStatus(chatID string, ids []types.MessageID, status string) {
	w.Lock()
	wanted, updates := map[string]bool{}, []Message{}
	for _, id := range ids {
		wanted[string(id)] = true
	}
	for index := range w.messages[chatID] {
		message := &w.messages[chatID][index]
		if message.Outgoing && wanted[message.ID] && message.Status != "read" {
			message.Status = status
			updates = append(updates, *message)
		}
	}
	w.Unlock()
	for _, message := range updates {
		_ = updateMessageStatus(w.db, w.profileID(), chatID, message.ID, message.Status)
		w.broadcast("messageUpdate", message)
	}
}

func (w *whatsApp) senderName(sender, alternate types.JID, pushName string) string {
	phone := sender
	if alternate.Server == types.DefaultUserServer {
		phone = alternate
	} else if sender.Server == types.HiddenUserServer {
		if mapped, err := w.client.Store.LIDs.GetPNForLID(context.Background(), sender); err == nil && !mapped.IsEmpty() {
			phone = mapped
		}
	}

	var whatsappName, redactedPhone string
	for _, jid := range []types.JID{phone, sender} {
		contact, err := w.client.Store.Contacts.GetContact(context.Background(), jid)
		if err != nil {
			continue
		}
		if contact.FullName != "" {
			return contact.FullName
		}
		if contact.FirstName != "" {
			return contact.FirstName
		}
		if whatsappName == "" {
			whatsappName = contact.PushName
			if whatsappName == "" {
				whatsappName = contact.BusinessName
			}
		}
		if redactedPhone == "" {
			redactedPhone = contact.RedactedPhone
		}
	}
	if pushName != "" {
		return pushName
	}
	if whatsappName != "" {
		return whatsappName
	}
	if phone.Server == types.DefaultUserServer {
		return "+" + phone.User
	}
	if redactedPhone != "" {
		return redactedPhone
	}
	return "Bilinmeyen kişi"
}

func (w *whatsApp) messageMetadata(message *waE2E.Message, metadata any) any {
	contextInfo := contextOf(message)
	if contextInfo == nil || len(contextInfo.GetMentionedJID()) == 0 {
		return metadata
	}
	result, ok := metadata.(map[string]any)
	if !ok {
		result = map[string]any{}
		if metadata != nil {
			result["value"] = metadata
		}
	}
	mentions := map[string]string{}
	for _, value := range contextInfo.GetMentionedJID() {
		jid, err := types.ParseJID(value)
		if err != nil {
			continue
		}
		name := w.contactName(jid, "+"+jid.User)
		mentions[jid.User] = name
	}
	if len(mentions) > 0 {
		result["mentions"] = mentions
	}
	return result
}

func (w *whatsApp) send(ctx context.Context, jid types.JID, text, replyTo string) (Message, error) {
	if !w.client.IsConnected() || !w.client.IsLoggedIn() {
		return Message{}, errors.New("WhatsApp bağlı değil")
	}
	waMessage := &waE2E.Message{Conversation: &text}
	var replyText string
	if replyTo != "" {
		target, ok := w.findMessage(jid.String(), replyTo)
		if !ok {
			return Message{}, errors.New("yanıtlanan mesaj bulunamadı")
		}
		participant := target.SenderID
		waMessage = &waE2E.Message{ExtendedTextMessage: &waE2E.ExtendedTextMessage{Text: &text, ContextInfo: &waE2E.ContextInfo{StanzaID: &target.ID, Participant: &participant, QuotedMessage: &waE2E.Message{Conversation: &target.Text}}}}
		replyText = target.Text
	}
	response, err := w.client.SendMessage(ctx, jid, waMessage)
	if err != nil {
		return Message{}, fmt.Errorf("mesaj gönderilemedi: %w", err)
	}
	message := Message{ID: string(response.ID), ChatID: jid.String(), SenderID: w.profileID(), SenderName: "Siz", Text: text, ReplyToID: replyTo, ReplyText: replyText, Outgoing: true, Status: "sent", CreatedAt: response.Timestamp}
	w.remember(message, "", true, true)
	return message, nil
}

func (w *whatsApp) findMessage(chatID, messageID string) (Message, bool) {
	w.RLock()
	defer w.RUnlock()
	for _, message := range w.messages[chatID] {
		if message.ID == messageID {
			return message, true
		}
	}
	return Message{}, false
}

func (w *whatsApp) media(ctx context.Context, chatID, messageID string) ([]byte, string, string, error) {
	message, ok := w.findMessage(chatID, messageID)
	if !ok || len(message.Raw) == 0 {
		return nil, "", "", errors.New("medya bulunamadı")
	}
	if message.Size > 100<<20 {
		return nil, "", "", errors.New("medya çok büyük")
	}
	var raw waE2E.Message
	if err := proto.Unmarshal(message.Raw, &raw); err != nil {
		return nil, "", "", errors.New("medya bilgisi bozuk")
	}
	var downloadable whatsmeow.DownloadableMessage
	switch message.Type {
	case "image":
		downloadable = raw.GetImageMessage()
	case "video":
		downloadable = raw.GetVideoMessage()
		if downloadable == nil {
			downloadable = raw.GetPtvMessage()
		}
	case "audio":
		downloadable = raw.GetAudioMessage()
	case "document":
		downloadable = raw.GetDocumentMessage()
	case "sticker":
		downloadable = raw.GetStickerMessage()
	}
	if downloadable == nil {
		return nil, "", "", errors.New("mesaj indirilebilir medya içermiyor")
	}
	data, err := w.client.Download(ctx, downloadable)
	if err != nil {
		return nil, "", "", fmt.Errorf("medya indirilemedi: %w", err)
	}
	if len(data) > 100<<20 {
		return nil, "", "", errors.New("medya çok büyük")
	}
	return data, message.Mime, message.FileName, nil
}

func (w *whatsApp) forward(ctx context.Context, chatID, messageID string, destination types.JID) (Message, error) {
	target, ok := w.findMessage(chatID, messageID)
	if !ok {
		return Message{}, errors.New("iletilecek mesaj bulunamadı")
	}
	text, forwarded := target.Text, true
	waMessage := &waE2E.Message{ExtendedTextMessage: &waE2E.ExtendedTextMessage{Text: &text, ContextInfo: &waE2E.ContextInfo{IsForwarded: &forwarded}}}
	response, err := w.client.SendMessage(ctx, destination, waMessage)
	if err != nil {
		return Message{}, fmt.Errorf("mesaj iletilemedi: %w", err)
	}
	message := Message{ID: string(response.ID), ChatID: destination.String(), SenderID: w.profileID(), SenderName: "Siz", Text: text, Forwarded: true, Outgoing: true, CreatedAt: response.Timestamp}
	w.remember(message, "", true, true)
	return message, nil
}

func (w *whatsApp) setReaction(chatID, messageID, reaction string, notify bool) {
	w.Lock()
	var updated Message
	for index := range w.messages[chatID] {
		if w.messages[chatID][index].ID == messageID {
			w.messages[chatID][index].Reaction = reaction
			updated = w.messages[chatID][index]
			break
		}
	}
	w.Unlock()
	if updated.ID == "" {
		return
	}
	_ = updateMessageReaction(w.db, w.profileID(), chatID, messageID, reaction)
	if notify {
		w.broadcast("messageUpdate", updated)
	}
}

func (w *whatsApp) setTyping(ctx context.Context, jid types.JID, typing bool) error {
	if !w.client.IsConnected() || !w.client.IsLoggedIn() {
		return errors.New("WhatsApp bağlı değil")
	}
	state := types.ChatPresencePaused
	if typing {
		state = types.ChatPresenceComposing
	}
	return w.client.SendChatPresence(ctx, jid, state, types.ChatPresenceMediaText)
}

func (w *whatsApp) subscribePresence(ctx context.Context, jid types.JID) error {
	if !w.client.IsConnected() || !w.client.IsLoggedIn() {
		return errors.New("WhatsApp bağlı değil")
	}
	return w.client.SubscribePresence(ctx, jid)
}

func (w *whatsApp) updatePresence(from types.JID, online bool) {
	w.Lock()
	changed := false
	for _, chat := range w.chats {
		jid, err := types.ParseJID(chat.ID)
		if err != nil || jid.Server == types.GroupServer {
			continue
		}
		match := jid.ToNonAD() == from.ToNonAD()
		if !match && jid.Server == types.HiddenUserServer && from.Server == types.DefaultUserServer {
			mapped, _ := w.client.Store.LIDs.GetPNForLID(context.Background(), jid)
			match = mapped.ToNonAD() == from.ToNonAD()
		} else if !match && jid.Server == types.DefaultUserServer && from.Server == types.HiddenUserServer {
			mapped, _ := w.client.Store.LIDs.GetLIDForPN(context.Background(), jid)
			match = mapped.ToNonAD() == from.ToNonAD()
		}
		if match && chat.Online != online {
			chat.Online, changed = online, true
		}
	}
	w.Unlock()
	if changed {
		w.broadcast("chats", w.chatList())
	}
}

func (w *whatsApp) chatList() []Chat {
	w.RLock()
	result := make([]Chat, 0, len(w.chats))
	for _, chat := range w.chats {
		result = append(result, *chat)
	}
	w.RUnlock()
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].Pinned != result[j].Pinned {
			return result[i].Pinned
		}
		return result[i].Updated.After(result[j].Updated)
	})
	return result
}

func (w *whatsApp) messageList(chat string) []Message {
	profileID := w.profileID()
	w.Lock()
	cached, loaded := w.messages[chat]
	result := append([]Message{}, cached...)
	chatInfo := w.chats[chat]
	if !loaded {
		result, _ = loadMessages(w.db, profileID, chat)
		w.messages = map[string][]Message{chat: result}
	}
	w.Unlock()
	jid, _ := types.ParseJID(chat)
	filtered := result[:0]
	for index := range result {
		if len(result[index].Raw) == 0 {
			filtered = append(filtered, result[index])
			continue
		}
		var raw waE2E.Message
		if err := proto.Unmarshal(result[index].Raw, &raw); err == nil {
			kind, text, mime, fileName, size, latitude, longitude, metadata := visibleMessage(&raw)
			if kind == "" && result[index].Type == "unsupported" {
				_ = deleteMessage(w.db, profileID, result[index].ID)
				continue
			}
			metadata = w.messageMetadata(&raw, metadata)
			if kind != "" {
				result[index].Type = kind
				result[index].Text = text
				result[index].Mime = mime
				result[index].FileName = fileName
				result[index].Size = size
				result[index].Latitude = latitude
				result[index].Longitude = longitude
				result[index].Metadata = metadata
				if err := repairMessage(w.db, profileID, result[index]); err != nil {
					log.Printf("mesaj düzeltilemedi: %v", err)
				}
			}
		}
		filtered = append(filtered, result[index])
	}
	result = filtered
	w.Lock()
	w.messages[chat] = result
	w.Unlock()
	if jid.Server != types.GroupServer && chatInfo != nil {
		name := w.contactName(jid, chatInfo.Name)
		for index := range result {
			if !result[index].Outgoing {
				result[index].SenderName = name
			}
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].CreatedAt.Equal(result[j].CreatedAt) {
			return result[i].ID < result[j].ID
		}
		return result[i].CreatedAt.Before(result[j].CreatedAt)
	})
	return result
}
