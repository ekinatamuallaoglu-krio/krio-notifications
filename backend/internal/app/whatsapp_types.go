package app

import (
	"database/sql"
	"sync"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
)

type authStatus struct {
	State string `json:"state"`
	QR    string `json:"qr,omitempty"`
	Error string `json:"error,omitempty"`
}

type streamEvent struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}
type profileMessageEvent struct {
	ProfileID string  `json:"profileId"`
	Message   Message `json:"message"`
}
type bulkSendResult struct {
	ChatID string `json:"chatId"`
	Error  string `json:"error,omitempty"`
}
type typingEvent struct {
	ChatID string `json:"chatId"`
	Name   string `json:"name,omitempty"`
	Typing bool   `json:"typing"`
}
type syncEvent struct {
	ProfileID string `json:"profileId"`
	Error     string `json:"error,omitempty"`
}
type historySyncWaiter struct {
	chatID  string
	matched bool
	done    chan struct{}
}

func ignoredChat(jid types.JID) bool {
	return jid == types.StatusBroadcastJID || jid.IsBroadcastList() || jid.Server == types.NewsletterServer
}

type whatsApp struct {
	sync.RWMutex
	client      *whatsmeow.Client
	clients     []*whatsmeow.Client
	container   *sqlstore.Container
	db          *sql.DB
	status      authStatus
	chats       map[string]*Chat
	messages    map[string][]Message
	listeners   map[chan streamEvent]struct{}
	startupSync sync.Once
	switchMu    sync.Mutex
	bulkMu      sync.Mutex
	statusOnce  sync.Once
	statusMu    sync.Mutex
	connectMu   sync.Mutex
	historyMu   sync.Mutex
	historyWait map[string]*historySyncWaiter
}

type bulkSendRow struct {
	Recipient string            `json:"recipient"`
	Values    map[string]string `json:"values"`
}
