package app

import "krio-chat/backend/internal/status"

func (w *whatsApp) startStatusScheduler() {
	w.statusOnce.Do(func() { status.StartScheduler(w.db, w.sendStatus) })
}

func (w *whatsApp) runDueStatusPosts() {
	w.statusMu.Lock()
	defer w.statusMu.Unlock()
	status.RunDue(w.db, w.sendStatus)
}
