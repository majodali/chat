// Deployment configuration, read from environment variables (see infra/.env.example).

export interface AppConfig {
  /** AWS account + region. Region must be us-east-1 when using a custom domain
   *  (CloudFront requires its ACM cert in us-east-1). */
  account?: string;
  region: string;
  /** Custom domain, e.g. "liddle.cloud". Leave empty to deploy to the
   *  auto-generated CloudFront URL only. */
  domainName?: string;
  /** Whether to also serve www.<domain>. */
  includeWww: boolean;
  /** First admin account, seeded on deploy. */
  adminUsername: string;
  adminPassword: string;
}

export function loadConfig(): AppConfig {
  const domainName = process.env.DOMAIN_NAME?.trim() || undefined;
  return {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || "us-east-1",
    domainName,
    includeWww: process.env.INCLUDE_WWW === "true",
    adminUsername: process.env.ADMIN_USERNAME?.trim() || "admin",
    adminPassword: process.env.ADMIN_PASSWORD || "",
  };
}
