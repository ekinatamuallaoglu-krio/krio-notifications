# Project

Krio Connect is a local WhatsApp companion application. It runs in a browser or Electron while sharing one Go/whatsmeow backend. Its light visual identity follows krio.tr and uses the official KRIO easyplus logo construction.

## Structure

- `backend/`: Go HTTP server, whatsmeow client, SQLite session, in-memory observed messages, API tests.
- `ui/`: Vite-powered vanilla JavaScript UI.
- `electron/`: secure minimal desktop window wrapper.

The production Go process embeds and serves `backend/web/dist`; development uses Vite on port 5173 and Go on port 8080.
