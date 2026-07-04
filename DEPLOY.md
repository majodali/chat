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
- **Your domain `liddle.cloud` managed by Route 53** (a *hosted zone* in this
  same AWS account). If your domain is registered elsewhere, create a hosted
  zone in Route 53 and point your registrar's nameservers at it. You can skip
  the domain entirely for a first test (see step 5).
- Deploy in **`us-east-1`** — CloudFront requires its TLS certificate there.

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

| Variable         | What it is                                                    |
| ---------------- | ------------------------------------------------------------- |
| `ADMIN_USERNAME` | The first admin login (you). Used to create everyone else.    |
| `ADMIN_PASSWORD` | A strong password for that admin account.                     |
| `DOMAIN_NAME`    | `liddle.cloud` (or blank to use the CloudFront URL for now).  |
| `INCLUDE_WWW`    | `true` to also serve `www.liddle.cloud`.                      |

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
LiddleChat.SiteUrl        = https://liddle.cloud
LiddleChat.CloudFrontUrl  = https://d1234abcd.cloudfront.net
LiddleChat.ApiUrl         = https://xxxx.execute-api.us-east-1.amazonaws.com
LiddleChat.WebSocketUrl   = wss://yyyy.execute-api.us-east-1.amazonaws.com/prod
```

- **With a domain:** CDK creates the TLS cert (DNS-validated automatically since
  the hosted zone is in the same account) and the Route 53 alias record. DNS +
  certificate propagation can take a few minutes on the very first deploy.
- **Without a domain:** open the `CloudFrontUrl` to use the app right away. Add
  `DOMAIN_NAME` later and re-deploy to attach the custom domain.

## 6. First login

1. Open your site URL.
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

The site bucket, CloudFront distribution, and connections table are removed
automatically.

## Troubleshooting

- **`cdk bootstrap` errors about credentials** — run `aws sts get-caller-identity`
  and make sure the right profile/region is active (`AWS_PROFILE`, `AWS_REGION`).
- **Certificate stuck "pending validation"** — confirm `liddle.cloud`'s
  nameservers at your registrar match the Route 53 hosted zone's NS records.
- **Website loads but can't log in / connect** — the SPA reads `/config.json`
  for the API + WebSocket URLs; a hard refresh clears a stale cached copy.
- **Region** — everything must be in `us-east-1` when using the custom domain.

## Cost

At a handful of users this is typically **low single-digit dollars/month**, and
often within the AWS Free Tier. You pay per request (Lambda, API Gateway),
per stored item (DynamoDB on-demand), per GB (S3), and CloudFront egress — all
of which round to near-zero for a small family chat. Nothing bills while idle.
