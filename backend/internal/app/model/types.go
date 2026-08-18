package model

import "time"

type Message struct {
	ID         string    `json:"id"`
	ChatID     string    `json:"chatId"`
	SenderID   string    `json:"senderId,omitempty"`
	SenderName string    `json:"senderName"`
	Text       string    `json:"text"`
	Type       string    `json:"type,omitempty"`
	Mime       string    `json:"mime,omitempty"`
	FileName   string    `json:"fileName,omitempty"`
	Size       uint64    `json:"size,omitempty"`
	Latitude   float64   `json:"latitude,omitempty"`
	Longitude  float64   `json:"longitude,omitempty"`
	Metadata   any       `json:"metadata,omitempty"`
	ReplyToID  string    `json:"replyToId,omitempty"`
	ReplyText  string    `json:"replyText,omitempty"`
	Reaction   string    `json:"reaction,omitempty"`
	Forwarded  bool      `json:"forwarded,omitempty"`
	Outgoing   bool      `json:"outgoing"`
	Status     string    `json:"status,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
	Raw        []byte    `json:"-"`
}

type Chat struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Avatar   string    `json:"avatar"`
	Online   bool      `json:"online"`
	Pinned   bool      `json:"pinned"`
	Unread   int       `json:"unread"`
	LastText string    `json:"lastText"`
	LastTime string    `json:"lastTime"`
	Updated  time.Time `json:"-"`
}

type Profile struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	WhatsAppName string `json:"whatsAppName"`
	Nickname     string `json:"nickname"`
	Sound        string `json:"sound"`
	Volume       int    `json:"volume"`
	TypingMin    int    `json:"typingMin"`
	TypingMax    int    `json:"typingMax"`
	DelayMin     int    `json:"delayMin"`
	DelayMax     int    `json:"delayMax"`
	Active       bool   `json:"active"`
	Unread       int    `json:"unread"`
	WorkEnabled  bool   `json:"workEnabled"`
	WorkDays     string `json:"workDays"`
	WorkStart    string `json:"workStart"`
	WorkEnd      string `json:"workEnd"`
}

type BulkTemplate struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Body string `json:"body"`
}

type BulkOperation struct {
	ID           int64               `json:"id"`
	UserID       int64               `json:"-"`
	ProfileID    string              `json:"profileId"`
	TemplateID   int64               `json:"templateId"`
	TemplateName string              `json:"templateName"`
	TemplateBody string              `json:"templateBody,omitempty"`
	Mode         string              `json:"mode"`
	StartedAt    time.Time           `json:"startedAt"`
	CompletedAt  *time.Time          `json:"completedAt,omitempty"`
	Status       string              `json:"status"`
	Total        int                 `json:"total"`
	Success      int                 `json:"success"`
	Failed       int                 `json:"failed"`
	Items        []BulkOperationItem `json:"items,omitempty"`
}

type BulkOperationItem struct {
	Row       int               `json:"row"`
	Recipient string            `json:"recipient"`
	Message   string            `json:"message"`
	Values    map[string]string `json:"values"`
	Status    string            `json:"status"`
	Error     string            `json:"error,omitempty"`
	SentAt    time.Time         `json:"sentAt"`
}

type StatusPost struct {
	ID          int64      `json:"id"`
	UserID      int64      `json:"-"`
	ProfileID   string     `json:"profileId"`
	Kind        string     `json:"kind"`
	Text        string     `json:"text"`
	Mime        string     `json:"mime,omitempty"`
	FileName    string     `json:"fileName,omitempty"`
	ScheduledAt time.Time  `json:"scheduledAt"`
	SentAt      *time.Time `json:"sentAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	Status      string     `json:"status"`
	Error       string     `json:"error,omitempty"`
	Media       []byte     `json:"-"`
}
