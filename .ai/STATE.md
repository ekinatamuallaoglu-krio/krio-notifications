# STATE

- Go/whatsmeow backend with vanilla JS/Vite UI and SQLite persistence.
- Multiple WhatsApp profiles share one database; every stored profile client connects at startup and profile switching only changes the active view.
- Profile switching loads only SQLite chat summaries; messages load on demand per opened chat and only that chat's latest 200 remain in memory.
- Inactive connected profiles persist incoming messages directly to SQLite, increment profile/chat unread counts, and emit profile-scoped sound/badge events without caching messages in RAM.
- Bulk messaging supports persisted `{{variable}}` templates, sender-profile selection, searchable multi-recipient selection, and sequential personalized sends capped at 50 recipients.
- Bulk sends run in a request-independent background queue; per-item counters and owned reports update while sending.
- Authorized users can publish or schedule text, image, and video WhatsApp statuses per profile; queued jobs persist in SQLite and the UI polls their sent/failed state.
- Profile settings use one tracked history sync action that refreshes contacts, requests 50 older messages per chat serially, and waits for each final WhatsApp chunk; the card shows progress until completion and persistence merges idempotently.
- First run validates a KRIO licence and creates the initial administrator; later starts invalidate sessions and remain on login when the licence is missing/invalid/unreachable, while expired licences remain usable with a renewal warning.
- Electron stays open on licence rejection because the backend continues serving the login screen and returns the licence error on login attempts.
- Local bcrypt users use hashed opaque 24-hour sessions. Administrators manage users/admins and profile/template grants; regular users see assigned resources and only their own bulk reports.
- Chats, rich message metadata/raw media references, profile nicknames, replies, forwarding state, poll votes, and own reactions persist per profile.
- Message UI supports native WhatsApp replies, text forwarding, own emoji reactions, and reaction removal; WhatsApp status broadcasts are excluded from chats and persistence.
- Incoming text, image, video/GIF/PTV, audio/voice, document, sticker, location/live location, contact, poll, event, invite, response, commerce, and call messages render with a safe fallback for newer types; media downloads on demand through whatsmeow.
- Live incoming messages increment a persisted unread count; opening the chat sends WhatsApp read receipts and clears it.
- Each profile persists its own notification sound (`chime`, `soft`, `pop`, `bell`, or silent) and volume; Web Audio plays it after the browser's first user interaction.
- Verification: `go test -race ./...`, `go vet ./...`, `go build ./...`, `npm run build`, and `node --check src.js` pass.
