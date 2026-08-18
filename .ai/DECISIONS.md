# DECISIONS

## WhatsApp profiles

- Initialize and keep one whatsmeow client connection per stored profile; the active profile only selects which client/data the API and UI display.
- Keep profile switching low-memory: load chat summaries only, lazily load the opened chat's latest 200 messages, and avoid contact/group network lookups on the switch path.
- Store app-local profile nicknames in SQLite.

## Message actions

- Use WhatsApp quoted-message context for replies and reaction protocol messages for reactions/removal.
- Forward the stored text as a WhatsApp message marked forwarded; media forwarding is out of scope until media storage exists.
- Persist only the active user's reaction shown by this client; aggregate reactions from other users are not modeled yet.
- Ignore `status@broadcast`, broadcast lists, and newsletters in every live/background/history ingestion path; remove legacy status rows when opening the app database.

## Licence and access control

- Validate the stored licence once before every configured application start against `POST https://itsme.krio.tr/api/licence/check`; on service/network errors or invalid reasons, clear sessions, skip WhatsApp connections, keep the backend running, and reject login with the licence error.
- Permit an expired licence but expose a persistent renewal warning; a pristine database may run only the first-setup flow.
- Store bcrypt password hashes and only SHA-256 hashes of random 24-hour session tokens in SQLite; enforce all profile, template, administration, and report-ownership permissions in the Go API.
- Existing bulk reports have owner `0` and are visible only to administrators; new reports retain the initiating user ID.

## History synchronization

- Treat WhatsApp history sync as additive: insert missing messages with conflict-ignore, preserve existing chats/messages, and keep only the latest 200 per chat in memory while retaining all synchronized rows in SQLite.
- A manual history sync refreshes contacts first, then requests the recommended 50 messages before each chat's oldest stored message one chat at a time; await the matching `ON_DEMAND` event at 100% after persistence before continuing or returning success.

## Status scheduling

- Publish statuses through `types.StatusBroadcastJID` so whatsmeow applies each profile's existing WhatsApp status privacy recipients; never ingest status broadcasts as chats.
- Persist scheduled text/image/video posts and media in SQLite, claim due jobs serially, retry while the profile is disconnected, record terminal results, and clear successfully sent media blobs.
