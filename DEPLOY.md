# Deploying Liddle Chat to AWS

This walks you through putting the app live at `liddle.cloud`. Everything is
serverless, so once deployed it costs almost nothing when idle.

You run these steps yourself with **your own AWS credentials** — the app is never
given access to your AWS account by anyone else.

---

## 1. Prerequisites

- **An AWS account** and the **AWS CLI** configured with credentials that can
  create resources:
  ```bash
  aws configure           # or aws sso login
  aws sts get-caller-identity   # should print your account
  ```
- **Node.js 20+** and npm.
- **Your existing `liddle.cloud` S3 bucket** that already serves the static
  site. The chat app is deployed into it under a `chat/` sub-folder — nothing
  else in the bucket is modified or deleted.
- Deploy in the **same AWS region** your `liddle.cloud` bucket lives in (set
  `CDK_DEFAULT_REGION` / `AWS_REGION` accordingly).

## 2. Get the code + install

```bash
git clone <this-repo> liddle-chat
cd liddle-chat
npm install
```

## 3. Configure

```bash
cp infra/.env.example infra/.env
# then edit infra/.env
```

Set at minimum:

| Variable           | What it is                                                    |
| ------------------ | ------------------------------------------------------------- |
| `ADMIN_USERNAME`   | The first admin login (you). Used to create everyone else.    |
| `ADMIN_PASSWORD`   | A strong password for that admin account.                     |
| `SITE_BUCKET_NAME` | Your existing site bucket (defaults to `liddle.cloud`).       |
| `SITE_PATH_PREFIX` | Sub-folder to host under (defaults to `chat`).                |
| `CDK_DEFAULT_REGION` | The region your bucket + resources live in.                 |

## 4. Bootstrap CDK (first time per account/region only)

```bash
cd infra
npx cdk bootstrap aws://<your-account-id>/us-east-1
cd ..
```

## 5. Deploy

```bash
npm run build:frontend      # build the web app
npm run deploy              # provision + deploy everything
```

The deploy prints outputs like:

```
LiddleChat.SiteUrl        = http://liddle.cloud/chat
LiddleChat.ApiUrl         = https://xxxx.execute-api.us-east-1.amazonaws.com
LiddleChat.WebSocketUrl   = wss://yyyy.execute-api.us-east-1.amazonaws.com/prod
```

The app's static files are written to `s3://liddle.cloud/chat/…` and served by
your existing site hosting. The `SiteUrl` is live as soon as the deploy
finishes (allow a moment for any browser cache). The `ApiUrl` and
`WebSocketUrl` are called by the app directly — you don't need to open them.

## 6. First login

1. Open **http://liddle.cloud/chat**.
2. Sign in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` from your `.env`.
3. Click **Admin** (bottom-left) → **Create account** to add your kids and
   friends. Give each a username + password. No email or phone needed.
4. They open the same URL, sign in, and start chatting. Tap **＋** to start a
   direct message or a group.

## Prefer push-button deploys? Use GitHub Actions

Instead of deploying from your laptop, you can have GitHub deploy for you on
every push to `main` (or via a manual button) — using short-lived OIDC
credentials, with no AWS keys stored anywhere. See
**[docs/CI_DEPLOY.md](./docs/CI_DEPLOY.md)** for the one-time role + secrets
setup. After that, the manual steps below aren't needed for routine updates.

## 7. Updating the app later

```bash
git pull
npm install
npm run build:frontend
npm run deploy
```

Deploys are incremental and the CloudFront cache is invalidated automatically.

## 8. Tearing down

```bash
cd infra
npx cdk destroy
```

To protect your data, these resources are **retained** on destroy and must be
deleted by hand in the AWS console if you truly want them gone:

- DynamoDB tables (`Users`, `Rooms`, `RoomMembers`, `Messages`)
- The image S3 bucket (family photos)
- The JWT secret

The connections table is removed automatically. Your **existing `liddle.cloud`
bucket is never deleted** — it's only imported, not managed by this stack. The
app's files remain under `chat/`; delete that folder by hand if you want to
remove the app from the site.

## Troubleshooting

- **`cdk bootstrap` errors about credentials** — run `aws sts get-caller-identity`
  and make sure the right profile/region is active (`AWS_PROFILE`, `AWS_REGION`).
- **`chat/` page 404s** — confirm the deploy wrote objects to
  `s3://liddle.cloud/chat/index.html`, and that your site serves that key. With
  S3 static-website hosting, `…/chat` (no trailing slash) redirects to `…/chat/`.
- **Website loads but can't log in / connect** — the SPA reads
  `/chat/config.json` for the API + WebSocket URLs; a hard refresh clears a
  stale cached copy.
- **Region** — deploy in the same region as your `liddle.cloud` bucket.

## Cost

At a handful of users this is typically **low single-digit dollars/month**, and
often within the AWS Free Tier. You pay per request (Lambda, API Gateway),
per stored item (DynamoDB on-demand), per GB (S3), and CloudFront egress — all
of which round to near-zero for a small family chat. Nothing bills while idle.
