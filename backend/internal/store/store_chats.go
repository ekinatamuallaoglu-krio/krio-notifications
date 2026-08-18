package store

import (
	"database/sql"
	"encoding/json"
	"time"
)

func LoadChats(db *sql.DB, profileID string) (map[string]*Chat, error) {
	chats := map[string]*Chat{}
	rows, err := db.Query(`SELECT id, name, last_text, updated_at, unread_count FROM krio_chats WHERE profile_id=?`, profileID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var chat Chat
		var updated int64
		if err = rows.Scan(&chat.ID, &chat.Name, &chat.LastText, &updated, &chat.Unread); err != nil {
			rows.Close()
			return nil, err
		}
		chat.Updated = time.UnixMilli(updated)
		chat.LastTime = chat.Updated.Format("15:04")
		chat.Avatar = Initials(chat.Name)
		chats[chat.ID] = &chat
	}
	if err = rows.Close(); err != nil {
		return nil, err
	}
	return chats, nil
}

func LoadChat(db *sql.DB, profileID, chatID string) (*Chat, error) {
	var chat Chat
	var updated int64
	err := db.QueryRow(`SELECT id,name,last_text,updated_at,unread_count FROM krio_chats WHERE profile_id=? AND id=?`, profileID, chatID).Scan(&chat.ID, &chat.Name, &chat.LastText, &updated, &chat.Unread)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	chat.Updated = time.UnixMilli(updated)
	chat.LastTime = chat.Updated.Format("15:04")
	chat.Avatar = Initials(chat.Name)
	return &chat, nil
}

func LoadMessages(db *sql.DB, profileID, chatID string) ([]Message, error) {
	rows, err := db.Query(`SELECT id, chat_id, sender_id, sender_name, text, outgoing, created_at, reply_to_id, reply_text, reaction, forwarded,message_type,mime_type,file_name,file_size,latitude,longitude,metadata,raw_message,status FROM krio_messages WHERE profile_id=? AND chat_id=? ORDER BY created_at DESC,id DESC LIMIT 200`, profileID, chatID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	messages := []Message{}
	for rows.Next() {
		var message Message
		var outgoing, forwarded int
		var created int64
		var metadata string
		if err = rows.Scan(&message.ID, &message.ChatID, &message.SenderID, &message.SenderName, &message.Text, &outgoing, &created, &message.ReplyToID, &message.ReplyText, &message.Reaction, &forwarded, &message.Type, &message.Mime, &message.FileName, &message.Size, &message.Latitude, &message.Longitude, &metadata, &message.Raw, &message.Status); err != nil {
			return nil, err
		}
		if metadata != "" {
			_ = json.Unmarshal([]byte(metadata), &message.Metadata)
		}
		message.Outgoing = outgoing != 0
		message.Forwarded = forwarded != 0
		message.CreatedAt = time.UnixMilli(created)
		messages = append(messages, message)
	}
	for left, right := 0, len(messages)-1; left < right; left, right = left+1, right-1 {
		messages[left], messages[right] = messages[right], messages[left]
	}
	return messages, rows.Err()
}

func LoadAppData(db *sql.DB, profileID string) (map[string]*Chat, map[string][]Message, error) {
	chats, err := LoadChats(db, profileID)
	if err != nil {
		return nil, nil, err
	}
	messages := map[string][]Message{}
	for chatID := range chats {
		messages[chatID], err = LoadMessages(db, profileID, chatID)
		if err != nil {
			return nil, nil, err
		}
	}
	return chats, messages, nil
}

func SaveAppData(db *sql.DB, profileID string, chat Chat, message Message) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	metadata, _ := json.Marshal(message.Metadata)
	if _, err = tx.Exec(`INSERT INTO krio_messages(profile_id,id,chat_id,sender_id,sender_name,text,outgoing,created_at,reply_to_id,reply_text,reaction,forwarded,message_type,mime_type,file_name,file_size,latitude,longitude,metadata,raw_message,status)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(profile_id,id) DO NOTHING`, profileID, message.ID, message.ChatID, message.SenderID, message.SenderName, message.Text, message.Outgoing, message.CreatedAt.UnixMilli(), message.ReplyToID, message.ReplyText, message.Reaction, message.Forwarded, message.Type, message.Mime, message.FileName, message.Size, message.Latitude, message.Longitude, string(metadata), message.Raw, message.Status); err != nil {
		return err
	}
	if _, err = tx.Exec(`INSERT INTO krio_chats(profile_id,id,name,last_text,updated_at,unread_count) VALUES(?,?,?,?,?,?)
		ON CONFLICT(profile_id,id) DO UPDATE SET name=excluded.name,last_text=excluded.last_text,updated_at=excluded.Updated_at,unread_count=excluded.unread_count
		WHERE excluded.Updated_at >= krio_chats.Updated_at`, profileID, chat.ID, chat.Name, chat.LastText, chat.Updated.UnixMilli(), chat.Unread); err != nil {
		return err
	}
	return tx.Commit()
}

func RepairMessage(db *sql.DB, profileID string, message Message) error {
	metadata, _ := json.Marshal(message.Metadata)
	_, err := db.Exec(`UPDATE krio_messages SET text=?,message_type=?,mime_type=?,file_name=?,file_size=?,latitude=?,longitude=?,metadata=? WHERE profile_id=? AND id=?`, message.Text, message.Type, message.Mime, message.FileName, message.Size, message.Latitude, message.Longitude, string(metadata), profileID, message.ID)
	return err
}

func DeleteMessage(db *sql.DB, profileID, messageID string) error {
	_, err := db.Exec("DELETE FROM krio_messages WHERE profile_id=? AND id=?", profileID, messageID)
	return err
}

func SaveAppSnapshot(db *sql.DB, profileID string, chats map[string]*Chat, messages map[string][]Message) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, chat := range chats {
		if _, err = tx.Exec(`INSERT INTO krio_chats(profile_id,id,name,last_text,updated_at,unread_count) VALUES(?,?,?,?,?,?) ON CONFLICT(profile_id,id) DO UPDATE SET name=excluded.name,last_text=excluded.last_text,updated_at=excluded.Updated_at WHERE excluded.Updated_at >= krio_chats.Updated_at`, profileID, chat.ID, chat.Name, chat.LastText, chat.Updated.UnixMilli(), chat.Unread); err != nil {
			return err
		}
	}
	for _, list := range messages {
		for _, message := range list {
			metadata, _ := json.Marshal(message.Metadata)
			if _, err = tx.Exec(`INSERT INTO krio_messages(profile_id,id,chat_id,sender_id,sender_name,text,outgoing,created_at,reply_to_id,reply_text,reaction,forwarded,message_type,mime_type,file_name,file_size,latitude,longitude,metadata,raw_message,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(profile_id,id) DO NOTHING`, profileID, message.ID, message.ChatID, message.SenderID, message.SenderName, message.Text, message.Outgoing, message.CreatedAt.UnixMilli(), message.ReplyToID, message.ReplyText, message.Reaction, message.Forwarded, message.Type, message.Mime, message.FileName, message.Size, message.Latitude, message.Longitude, string(metadata), message.Raw, message.Status); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func UpdateMessageReaction(db *sql.DB, profileID, chatID, messageID, reaction string) error {
	_, err := db.Exec(`UPDATE krio_messages SET reaction=? WHERE profile_id=? AND chat_id=? AND id=?`, reaction, profileID, chatID, messageID)
	return err
}

func UpdateMessageStatus(db *sql.DB, profileID, chatID, messageID, status string) error {
	_, err := db.Exec(`UPDATE krio_messages SET status=? WHERE profile_id=? AND chat_id=? AND id=?`, status, profileID, chatID, messageID)
	return err
}

func UpdateMessageMetadata(db *sql.DB, profileID, chatID, messageID string, metadata any) error {
	encoded, _ := json.Marshal(metadata)
	_, err := db.Exec(`UPDATE krio_messages SET metadata=? WHERE profile_id=? AND chat_id=? AND id=?`, string(encoded), profileID, chatID, messageID)
	return err
}

func ClearUnread(db *sql.DB, profileID, chatID string) error {
	_, err := db.Exec(`UPDATE krio_chats SET unread_count=0 WHERE profile_id=? AND id=?`, profileID, chatID)
	return err
}

func ClearAppData(db *sql.DB, profileID string) error {
	_, err := db.Exec(`DELETE FROM krio_messages WHERE profile_id=?; DELETE FROM krio_chats WHERE profile_id=?; DELETE FROM krio_profile_names WHERE profile_id=?`, profileID, profileID, profileID)
	return err
}

func CloneAppData(chats map[string]*Chat, messages map[string][]Message) (map[string]*Chat, map[string][]Message) {
	chatCopy, messageCopy := make(map[string]*Chat, len(chats)), make(map[string][]Message, len(messages))
	for id, chat := range chats {
		copy := *chat
		chatCopy[id] = &copy
	}
	for id, list := range messages {
		messageCopy[id] = append([]Message(nil), list...)
	}
	return chatCopy, messageCopy
}
