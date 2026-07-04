#!/usr/bin/env node
import * as dotenv from "dotenv";
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { ChatStack } from "../lib/chat-stack";
import { loadConfig } from "../lib/config";

// Load infra/.env so config (domain, admin creds) is available to CDK.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const config = loadConfig();
const app = new cdk.App();

new ChatStack(app, "LiddleChat", {
  env: { account: config.account, region: config.region },
  config,
  description: "Liddle Chat — self-hosted serverless chat for liddle.cloud",
});
