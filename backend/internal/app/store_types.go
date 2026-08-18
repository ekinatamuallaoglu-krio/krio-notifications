package app

import "time"

type profilePreference struct {
	Nickname    string
	Sound       string
	Volume      int
	TypingMin   int
	TypingMax   int
	DelayMin    int
	DelayMax    int
	WorkEnabled int
	WorkDays    string
	WorkStart   string
	WorkEnd     string
}

type historyAnchor struct {
	ID        string
	ChatID    string
	Outgoing  bool
	CreatedAt time.Time
}
