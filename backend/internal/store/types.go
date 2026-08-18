package store

import (
	"time"

	"krio-chat/backend/internal/app/model"
)

type Message = model.Message
type Chat = model.Chat
type BulkTemplate = model.BulkTemplate
type BulkOperation = model.BulkOperation
type BulkOperationItem = model.BulkOperationItem

type ProfilePreference struct {
	Nickname, Sound                                  string
	Volume, TypingMin, TypingMax, DelayMin, DelayMax int
	WorkEnabled                                      int
	WorkDays, WorkStart, WorkEnd                     string
}
type HistoryAnchor struct {
	ID, ChatID string
	Outgoing   bool
	CreatedAt  time.Time
}
type BulkSendResult struct {
	ChatID string
	Error  string
}
type User struct {
	ID   int64
	Role string
}

func Initials(name string) string {
	if name == "" {
		return "?"
	}
	return string([]rune(name)[0])
}

func InitAccessStore(_ interface{}) error { return nil }
