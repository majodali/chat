# Family Chat

A small, self-hosted, **invite-only** chat app. Built so kids
(and close friends) can message each other from any web browser — no phone or app
store required. Fully **serverless on AWS**, so it costs almost nothing when idle
and there is no server to patch.

## What it does (v1)

- 🔐 **Admin-created accounts** — you create usernames + passwords from an admin
  page. No email or phone number needed.
- 💬 **Group rooms + direct messages** — real-time text chat.
- 🖼️ **Image sharing** — send photos (uploaded straight to S3).
- 🟢 **Presence + typing** — see who's online and who's typing.
- 🕓 **Persistent history** — messages survive reloads and restarts.

## Architecture

Everything is serverless and AWS-native. The web app lives at
**`liddle.cloud/chat`** — its static files are deployed into the *existing*
`liddle.cloud` S3 bucket under a `chat/` sub-folder, so the rest of the site is
untouched.

```
Browser
   │
   ├─ Static SPA  ──►  existing liddle.cloud S3 bucket, under /chat   (the web app)
   │
   ├─ REST calls  ──►  API Gateway (HTTP API) ─► Lambda ─► DynamoDB / S3
   │                    login, admin, rooms, history, upload URLs
   │
   └─ Realtime    ──►  API Gateway (WebSocket API) ─► Lambda ─► DynamoDB
                        live messages, presence, typing
```

| Concern        | Technology                                   |
| -------------- | -------------------------------------------- |
| Web hosting    | Existing `liddle.cloud` S3 bucket, under `/chat` |
| REST API       | API Gateway HTTP API + Lambda                |
| Realtime       | API Gateway WebSocket API + Lambda           |
| Database       | DynamoDB (on-demand)                         |
| Image storage  | S3 (presigned upload/download URLs)          |
| Auth           | Custom bcrypt password hash + JWT            |
| Infra-as-code  | AWS CDK (TypeScript)                         |

## Repo layout

```
backend/    Lambda handlers (TypeScript) — HTTP + WebSocket + shared lib
frontend/   React + Vite single-page app
infra/      AWS CDK app that provisions the whole stack
DEPLOY.md   Step-by-step deployment guide (you run this with your AWS creds)
```

## Quick start

See **[DEPLOY.md](./DEPLOY.md)** for the full walkthrough. In short:

```bash
npm install
# configure infra/.env with your domain + AWS account
npm run deploy
```

## Local development

```bash
npm install
npm run typecheck        # typecheck all workspaces
npm run build:frontend   # build the SPA
```

## Data model (DynamoDB)

| Table         | Key                                  | Purpose                              |
| ------------- | ------------------------------------ | ------------------------------------ |
| `Users`       | `userId` (PK), GSI on `username`     | Accounts + hashed passwords          |
| `Rooms`       | `roomId` (PK)                        | Group rooms and DMs (a DM = 2-person room) |
| `RoomMembers` | `roomId` (PK) + `userId` (SK), GSI on `userId` | Who is in which room       |
| `Messages`    | `roomId` (PK) + `sk` (SK: time#id)   | Message history, time-sorted         |
| `Connections` | `connectionId` (PK), GSI on `userId` | Live WebSocket connections → presence + fan-out |

## Cost

At a handful of users this typically lands in **low single-digit dollars per
month**, often within the AWS free tier. You pay per request and per GB stored;
nothing runs (or bills) while no one is chatting.
