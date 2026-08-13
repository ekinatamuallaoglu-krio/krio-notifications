# DECISIONS
## 2026-08-12 — Keep credentials transient
The Graph API version, access token, and phone number ID are read from the repository's existing environment variables and used only in the server route. They are excluded from client requests, database records, console logs, and API responses.

## 2026-08-12 — Persist attempts before network calls
A pending message row is created before calling WhatsApp, then updated with success/failure details so network failures are retained.

## 2026-08-12 — Authenticate webhook deliveries
`POST /api/hook` verifies `X-Hub-Signature-256` against the exact raw body with `META_APP_SECRET` before parsing it. Webhook payload contents are not logged; processing can be added when a concrete event behavior is required.

## 2026-08-12 — Run Baileys as one process-local socket
The web UI polls a Node route backed by one global Baileys socket. Authentication is persisted under ignored `data/baileys-auth`, while recent chats and messages remain memory-only. This intentionally targets a long-running server with durable writable disk, not ephemeral serverless instances.

## 2026-08-12 — Isolate Baileys sessions per account
The legacy session remains the `default` account at `data/baileys-auth`. Additional accounts receive server-generated safe IDs, separate auth directories under `data/baileys-accounts`, and independent process-local sockets and contact caches. API sends and logout always target an explicit account; logout deletes only that account's auth.

## 2026-08-12 — Keep WhatsApp media transient
Uploaded image, video, audio, and document buffers are passed directly to Baileys and are not persisted. Uploads are capped at 25 MB. Incoming media is resolved from the account's in-memory message store and downloaded on demand with safe response headers; message history unavailable after a process restart cannot be downloaded until Baileys syncs it again.

## 2026-08-12 — Push Baileys invalidations with SSE
The browser maintains one account-scoped Server-Sent Events connection instead of polling every three seconds. Baileys events publish lightweight invalidations; the client debounces them and fetches current state. Commands remain normal POST requests. This single-process deployment needs no Redis or WebSocket service; add shared Pub/Sub only when running multiple application replicas.

## 2026-08-12 — Persist Baileys event state per account
Auth alone does not contain contacts, chats, or message history, and WhatsApp does not replay bootstrap history to an already-synced linked device after process restart. Each account therefore loads an atomic V8 snapshot before socket creation and persists chat/contact/message events with debounce; `getMessage` reads this store. A one-time QR relink is surfaced for legacy sessions whose history was already lost.

## 2026-08-13 — Apply campaign pacing globally
Minimum and maximum Excel campaign delays are stored as one SQLite-backed global setting shared by every WhatsApp profile. New campaigns copy the current values when created so running and historical campaigns keep their original pacing.

## 2026-08-13 — Enforce local role and profile authorization
Users, scrypt password hashes, opaque hashed sessions, one-time password-reset tokens, roles, and profile assignments live in the existing SQLite database. Every WhatsApp, media, SSE, campaign, settings, and Graph send route checks the session server-side; admins see all profiles while users see only assigned profile IDs. The first admin is bootstrapped from environment variables.

## 2026-08-13 — Send password resets through admin-configured SMTP
Forgot-password always returns a generic response. Admins configure and verify Nodemailer SMTP settings in the application; the SMTP password is AES-256-GCM encrypted with an environment-provided key and is never returned by APIs. Reset links are exposed only in development when delivery fails.

## 2026-08-13 — License a central installation and keep users on it
First-run central setup validates a licence key against `/api/licence/check`, encrypts the key at rest, and registers the first admin from entered credentials rather than environment variables. Every later login checks the stored licence after credential verification. Missing, inactive, or in-use licences block login; expired licences allow login with a warning. A LAN user enters a private-network central URL and is redirected to that instance for all traffic.

## 2026-08-13 — Ship on-prem builds as embedded standalone payloads
Platform-native GitHub runners build Next standalone with the matching Node runtime and sqlite3 addon. Application server bundles are obfuscated and source maps removed before a checksum-verified payload is embedded in a Rust launcher. The launcher extracts versioned runtime files to user cache and keeps mutable app data separate. This raises reverse-engineering cost but does not claim secrecy against a machine administrator.
