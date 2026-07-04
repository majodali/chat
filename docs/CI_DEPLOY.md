# Deploying via GitHub Actions

The `Deploy` workflow (`.github/workflows/deploy.yml`) builds and deploys the
whole app to AWS on every push to `main` (and on-demand via the **Run workflow**
button).

Authentication uses **GitHub OIDC**: the workflow asks AWS for short-lived
credentials at run time by assuming an IAM role you create once. **No AWS access
keys are ever stored in the repo.**

---

## One-time AWS setup

### 1. Add GitHub as an OIDC identity provider (once per AWS account)

Skip if you already have `token.actions.githubusercontent.com` under
IAM → Identity providers.

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

### 2. Create the deploy role

Create a trust policy scoped to **this repository** so only this repo can assume
the role. Replace `<ACCOUNT_ID>` and, if your repo isn't `majodali/chat`, the
`sub` value:

`trust-policy.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:majodali/chat:*"
        }
      }
    }
  ]
}
```

```bash
aws iam create-role \
  --role-name liddle-chat-deploy \
  --assume-role-policy-document file://trust-policy.json

# CDK bootstrap + deploy needs broad provisioning permissions. On a personal
# account, AdministratorAccess is the simplest choice. You can scope it down
# later (it needs CloudFormation, S3, Lambda, DynamoDB, API Gateway, CloudFront,
# Route53, ACM, IAM, Secrets Manager, and Logs).
aws iam attach-role-policy \
  --role-name liddle-chat-deploy \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

Note the role ARN it prints (`arn:aws:iam::<ACCOUNT_ID>:role/liddle-chat-deploy`).

## One-time GitHub setup

In the repo → **Settings**:

**Secrets** (Settings → Secrets and variables → Actions → *Secrets*):

| Secret                 | Value                                             |
| ---------------------- | ------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN`  | The role ARN from above                           |
| `ADMIN_USERNAME`       | First admin login (you)                           |
| `ADMIN_PASSWORD`       | A strong password for that admin account          |

**Variables** (same page → *Variables*):

| Variable       | Value                                               |
| -------------- | --------------------------------------------------- |
| `AWS_REGION`   | `us-east-1` (required for the custom domain)        |
| `DOMAIN_NAME`  | `liddle.cloud` (or leave unset to use CloudFront)   |
| `INCLUDE_WWW`  | `true` or `false`                                   |

**(Optional) Environment protection:** the workflow targets a `production`
environment. Create it under Settings → Environments to add approval gates or
environment-scoped secrets. It works without one too.

## Run it

- **Automatic:** push to `main`.
- **Manual:** Actions tab → **Deploy** → **Run workflow**.

The run typechecks, builds the SPA, bootstraps CDK (idempotent), deploys, and
prints the stack outputs (site URL, API URL, etc.) in the run summary.

> The very first deploy with a custom domain also provisions a TLS certificate
> and DNS records; allow a few minutes for propagation.

## Security notes

- Credentials are short-lived and minted per run via OIDC — nothing to rotate or
  leak.
- The trust policy restricts assumption to `repo:majodali/chat:*`. To lock it to
  a single branch, change the `sub` to
  `repo:majodali/chat:ref:refs/heads/main`.
- `ADMIN_PASSWORD` seeds only the *first* admin account; change it in the app
  afterward if you like, and rotate the secret.
