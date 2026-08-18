package app

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types"
)

func (w *whatsApp) profileID() string {
	w.RLock()
	defer w.RUnlock()
	return w.client.Store.GetJID().String()
}

func (w *whatsApp) contactName(jid types.JID, fallback string) string {
	if jid.Server == types.GroupServer {
		if group, err := w.client.GetGroupInfo(context.Background(), jid); err == nil && group.Name != "" {
			return group.Name
		}
	}
	phone := jid
	if jid.Server == types.HiddenUserServer {
		if mapped, err := w.client.Store.LIDs.GetPNForLID(context.Background(), jid); err == nil && !mapped.IsEmpty() {
			phone = mapped
		}
	}
	var whatsappName, redactedPhone string
	for _, candidate := range []types.JID{phone, jid} {
		contact, err := w.client.Store.Contacts.GetContact(context.Background(), candidate)
		if err != nil {
			continue
		}
		for _, name := range []string{contact.FullName, contact.FirstName} {
			if name != "" {
				return name
			}
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
	if fallback != "" {
		return fallback
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

func (w *whatsApp) localContactName(jid types.JID, fallback string) string {
	if jid.Server == types.GroupServer {
		if group, err := w.client.GetGroupInfo(context.Background(), jid); err == nil && group.Name != "" {
			return group.Name
		}
		return fallback
	}
	phone := jid
	if jid.Server == types.HiddenUserServer {
		if mapped, err := w.client.Store.LIDs.GetPNForLID(context.Background(), jid); err == nil && !mapped.IsEmpty() {
			phone = mapped
		}
	}
	for _, candidate := range []types.JID{phone, jid} {
		contact, err := w.client.Store.Contacts.GetContact(context.Background(), candidate)
		if err != nil {
			continue
		}
		for _, name := range []string{contact.FullName, contact.FirstName, contact.PushName, contact.BusinessName} {
			if name != "" {
				return name
			}
		}
	}
	return fallback
}

func (w *whatsApp) logout(ctx context.Context) error {
	w.switchMu.Lock()
	defer w.switchMu.Unlock()
	w.RLock()
	client := w.client
	w.RUnlock()
	profileID := client.Store.GetJID().String()
	if client.Store.ID != nil {
		if err := client.Logout(ctx); err != nil {
			return err
		}
	}
	if err := clearAppData(w.db, profileID); err != nil {
		return fmt.Errorf("yerel mesajlar temizlenemedi: %w", err)
	}
	devices, err := w.container.GetAllDevices(ctx)
	if err != nil {
		return err
	}
	if len(devices) > 0 {
		return w.activateDevice(devices[0])
	}
	w.startPairingLocked()
	return nil
}

func (w *whatsApp) startPairing() {
	w.switchMu.Lock()
	defer w.switchMu.Unlock()
	w.startPairingLocked()
}

func (w *whatsApp) startPairingLocked() {
	device := w.container.NewDevice()
	w.Lock()
	w.useDevice(device, true)
	w.chats = map[string]*Chat{}
	w.messages = map[string][]Message{}
	w.startupSync = sync.Once{}
	w.status = authStatus{State: "starting"}
	status := w.status
	w.Unlock()
	w.broadcast("chats", []Chat{})
	w.broadcast("auth", status)
	go w.connect(w.client)
}

func (w *whatsApp) profiles() []Profile {
	devices, err := w.container.GetAllDevices(context.Background())
	if err != nil {
		return []Profile{}
	}
	active := w.profileID()
	preferences := profilePreferences(w.db)
	unreadCounts := profileUnreadCounts(w.db)
	result := make([]Profile, 0, len(devices))
	for _, device := range devices {
		id := device.GetJID().String()
		name := device.PushName
		if name == "" {
			name = device.BusinessName
		}
		if name == "" {
			name = "+" + device.GetJID().User
		}
		preference := preferences[id]
		nickname := preference.Nickname
		if preference.Sound == "" {
			preference.Sound, preference.Volume = "chime", 70
		}
		displayName := name
		if nickname != "" {
			displayName = nickname
		}
		if preference.TypingMin == 0 {
			preference.TypingMin, preference.TypingMax, preference.DelayMin, preference.DelayMax = 100, 200, 1000, 5000
		}
		result = append(result, Profile{ID: id, Name: displayName, WhatsAppName: name, Nickname: nickname, Sound: preference.Sound, Volume: preference.Volume, TypingMin: preference.TypingMin, TypingMax: preference.TypingMax, DelayMin: preference.DelayMin, DelayMax: preference.DelayMax, Active: id == active, Unread: unreadCounts[id], WorkEnabled: preference.WorkEnabled != 0, WorkDays: preference.WorkDays, WorkStart: preference.WorkStart, WorkEnd: preference.WorkEnd})
	}
	return result
}

func (w *whatsApp) activateDevice(device *store.Device) error {
	chats, err := loadChats(w.db, device.GetJID().String())
	if err != nil {
		return err
	}
	w.Lock()
	client := w.clientFor(device.GetJID().String())
	if client == nil {
		client = w.useDevice(device, false)
	}
	w.client = client
	w.chats, w.messages = chats, map[string][]Message{}
	w.startupSync = sync.Once{}
	if client.IsConnected() && client.IsLoggedIn() {
		w.status = authStatus{State: "connected"}
	} else {
		w.status = authStatus{State: "connecting"}
	}
	w.Unlock()
	names := map[string]string{}
	for _, chat := range chats {
		jid, parseErr := types.ParseJID(chat.ID)
		if parseErr == nil {
			names[chat.ID] = w.localContactName(jid, chat.Name)
		}
	}
	w.Lock()
	for id, name := range names {
		if chat := w.chats[id]; chat != nil {
			chat.Name, chat.Avatar = name, initials(name)
		}
	}
	w.Unlock()
	w.broadcast("profiles", w.profiles())
	w.broadcast("chats", w.chatList())
	w.broadcast("auth", w.auth())
	return nil
}

func (w *whatsApp) switchProfile(ctx context.Context, id string) error {
	w.switchMu.Lock()
	defer w.switchMu.Unlock()
	jid, err := types.ParseJID(id)
	if err != nil {
		return errors.New("geçersiz profil")
	}
	device, err := w.container.GetDevice(ctx, jid)
	if err != nil {
		return err
	}
	if device == nil {
		return errors.New("profil bulunamadı")
	}
	return w.activateDevice(device)
}

func (w *whatsApp) addProfile() { w.startPairing() }

func (w *whatsApp) updateProfile(ctx context.Context, id, nickname, sound string, volume, typingMin, typingMax, delayMin, delayMax, workEnabled int, workDays, workStart, workEnd string) error {
	jid, err := types.ParseJID(id)
	if err != nil {
		return errors.New("geçersiz profil")
	}
	device, err := w.container.GetDevice(ctx, jid)
	if err != nil || device == nil {
		return errors.New("profil bulunamadı")
	}
	if err = saveProfilePreference(w.db, id, nickname, sound, volume, typingMin, typingMax, delayMin, delayMax, workEnabled, workDays, workStart, workEnd); err != nil {
		return err
	}
	w.broadcast("profiles", w.profiles())
	return nil
}

func (w *whatsApp) profileClient(id string) (*whatsmeow.Client, error) {
	w.RLock()
	defer w.RUnlock()
	client := w.clientFor(id)
	if client == nil || !client.IsConnected() || !client.IsLoggedIn() {
		return nil, errors.New("profil bağlı değil")
	}
	return client, nil
}

func contactName(client *whatsmeow.Client, jid types.JID, fallback string) string {
	phone := jid
	if jid.Server == types.HiddenUserServer {
		if mapped, err := client.Store.LIDs.GetPNForLID(context.Background(), jid); err == nil && !mapped.IsEmpty() {
			phone = mapped
		}
	}
	for _, candidate := range []types.JID{phone, jid} {
		contact, err := client.Store.Contacts.GetContact(context.Background(), candidate)
		if err != nil {
			continue
		}
		for _, name := range []string{contact.FullName, contact.FirstName, contact.PushName, contact.BusinessName} {
			if name != "" {
				return name
			}
		}
	}
	return fallback
}

func (w *whatsApp) logoutProfile(ctx context.Context, id string) error {
	w.switchMu.Lock()
	defer w.switchMu.Unlock()
	jid, err := types.ParseJID(id)
	if err != nil {
		return errors.New("geçersiz profil")
	}
	device, err := w.container.GetDevice(ctx, jid)
	if err != nil || device == nil {
		return errors.New("profil bulunamadı")
	}
	w.RLock()
	activeClient := w.client
	active := activeClient.Store.GetJID().String() == id
	client := w.clientFor(id)
	w.RUnlock()
	if client == nil {
		return errors.New("profil istemcisi bulunamadı")
	}
	if client.Store.ID != nil {
		if err = client.Logout(ctx); err != nil {
			return err
		}
	}
	if err = clearAppData(w.db, id); err != nil {
		return fmt.Errorf("yerel profil verileri temizlenemedi: %w", err)
	}
	w.Lock()
	for index, candidate := range w.clients {
		if candidate == client {
			w.clients = append(w.clients[:index], w.clients[index+1:]...)
			break
		}
	}
	w.Unlock()
	if !active {
		w.broadcast("profiles", w.profiles())
		return nil
	}
	devices, err := w.container.GetAllDevices(ctx)
	if err != nil {
		return err
	}
	if len(devices) > 0 {
		return w.activateDevice(devices[0])
	}
	w.startPairingLocked()
	return nil
}

func (w *whatsApp) profileAvatar(ctx context.Context, id string) (string, error) {
	jid, err := types.ParseJID(id)
	if err != nil {
		return "", err
	}
	device, err := w.container.GetDevice(ctx, jid)
	if err != nil || device == nil {
		return "", errors.New("profil bulunamadı")
	}
	w.RLock()
	client := w.clientFor(id)
	w.RUnlock()
	if client == nil || !client.IsConnected() {
		return "", errors.New("profil bağlı değil")
	}
	info, err := client.GetProfilePictureInfo(ctx, jid.ToNonAD(), &whatsmeow.GetProfilePictureParams{Preview: true})
	if err != nil || info == nil || info.URL == "" {
		return "", errors.New("profil fotoğrafı yok")
	}
	return info.URL, nil
}
