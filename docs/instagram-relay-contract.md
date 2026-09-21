# Instagram Relay Contract

`krio-licence` is public relay for Instagram API with Instagram Login.

## Trust Boundary

- Relay stores Meta App Secret and Instagram access tokens.
- Local application stores only `instagram:<account-id>`, relay licence identity and event cursor.
- OAuth callback and Meta webhook must use public HTTPS with valid CA certificate.
- Relay validates webhook `X-Hub-Signature-256`, deduplicates event IDs and stores events durably.

## Local API

- `POST /api/instagram/connect` creates relay OAuth session.
- `GET /api/instagram/oauth/{session}` polls session status.
- `POST /api/profiles/{id}/activate` selects connected account.
- Existing chat endpoints dispatch to active provider.

## Relay API

- `POST /api/instagram/oauth/sessions`
- `GET /api/instagram/oauth/sessions/{session}`
- `GET /api/instagram/connections`
- `GET|POST /api/instagram/accounts/{account}/{graph-path}`
- `GET /api/instagram/accounts/{account}/events?after={cursor}`

Every local request authenticates with `X-Krio-Licence`. Relay forwards Graph API v26.0 requests using stored account token.

## Meta Limits

- Permissions: `instagram_business_basic`, `instagram_business_manage_messages`.
- Text messages: maximum 1000 UTF-8 bytes.
- Conversation message details: Meta returns only latest 20 message details.
- Customer conversation window: 24 hours, except approved Human Agent use cases.
- Instagram does not expose WhatsApp bulk, status, presence or native forward behavior used by this application.
