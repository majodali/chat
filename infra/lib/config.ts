// Deployment configuration, read from environment variables (see infra/.env.example).

export interface AppConfig {
  /** AWS account + region (region must match where the existing site bucket
   *  lives; API/data resources are created there too). */
  account?: string;
  region: string;
  /** Existing S3 bucket that already hosts liddle.cloud. The chat app is
   *  deployed INTO this bucket under a sub-folder — the rest of the site is
   *  never touched. */
  siteBucketName: string;
  /** Sub-folder / key prefix the chat app lives under (no leading/trailing
   *  slash), e.g. "chat" -> liddle.cloud/chat. */
  sitePathPrefix: string;
  /** Public URL the app is reached at, used only for the deploy output. */
  siteBaseUrl: string;
  /** First admin account, seeded on deploy. */
  adminUsername: string;
  adminPassword: string;
}

export function loadConfig(): AppConfig {
  const siteBucketName = process.env.SITE_BUCKET_NAME?.trim() || "liddle.cloud";
  const sitePathPrefix =
    (process.env.SITE_PATH_PREFIX?.trim() || "chat").replace(/^\/+|\/+$/g, "");
  const siteBaseUrl =
    process.env.SITE_BASE_URL?.trim() ||
    `http://${siteBucketName}/${sitePathPrefix}`;

  return {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || "us-east-1",
    siteBucketName,
    sitePathPrefix,
    siteBaseUrl,
    adminUsername: process.env.ADMIN_USERNAME?.trim() || "admin",
    adminPassword: process.env.ADMIN_PASSWORD || "",
  };
}
