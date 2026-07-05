import * as path from "node:path";
import {
  Stack,
  StackProps,
  RemovalPolicy,
  Duration,
  CfnOutput,
  CustomResource,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwInteg from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as customResources from "aws-cdk-lib/custom-resources";
import * as logs from "aws-cdk-lib/aws-logs";
import type { AppConfig } from "./config";

const BACKEND = path.join(__dirname, "..", "..", "backend", "src");
const FRONTEND_DIST = path.join(__dirname, "..", "..", "frontend", "dist");

export interface ChatStackProps extends StackProps {
  config: AppConfig;
}

export class ChatStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatStackProps) {
    super(scope, id, props);
    const { config } = props;

    // ---------------------------------------------------------------
    // DynamoDB tables
    // ---------------------------------------------------------------
    const users = new dynamodb.Table(this, "Users", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN, // don't lose accounts on stack delete
      pointInTimeRecovery: true,
    });
    users.addGlobalSecondaryIndex({
      indexName: "UsernameIndex",
      partitionKey: { name: "usernameLower", type: dynamodb.AttributeType.STRING },
    });

    const rooms = new dynamodb.Table(this, "Rooms", {
      partitionKey: { name: "roomId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const roomMembers = new dynamodb.Table(this, "RoomMembers", {
      partitionKey: { name: "roomId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    roomMembers.addGlobalSecondaryIndex({
      indexName: "UserIndex",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
    });

    const messages = new dynamodb.Table(this, "Messages", {
      partitionKey: { name: "roomId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const connections = new dynamodb.Table(this, "Connections", {
      partitionKey: { name: "connectionId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY, // ephemeral — safe to drop
    });
    connections.addGlobalSecondaryIndex({
      indexName: "UserIndex",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
    });

    // ---------------------------------------------------------------
    // S3 bucket for shared images
    // ---------------------------------------------------------------
    const imageBucket = new s3.Bucket(this, "ImageBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN, // don't delete family photos on teardown
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
    });

    // ---------------------------------------------------------------
    // JWT signing secret
    // ---------------------------------------------------------------
    const jwtSecret = new secretsmanager.Secret(this, "JwtSecret", {
      description: "Liddle Chat JWT signing secret",
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    // ---------------------------------------------------------------
    // Lambda factory
    // ---------------------------------------------------------------
    const commonEnv: Record<string, string> = {
      USERS_TABLE: users.tableName,
      ROOMS_TABLE: rooms.tableName,
      ROOM_MEMBERS_TABLE: roomMembers.tableName,
      MESSAGES_TABLE: messages.tableName,
      CONNECTIONS_TABLE: connections.tableName,
      IMAGE_BUCKET: imageBucket.bucketName,
      JWT_SECRET: jwtSecret.secretValue.unsafeUnwrap(),
      NODE_OPTIONS: "--enable-source-maps",
    };

    const makeFn = (id: string, entry: string): lambdaNode.NodejsFunction => {
      const fn = new lambdaNode.NodejsFunction(this, id, {
        entry: path.join(BACKEND, entry),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 256,
        timeout: Duration.seconds(15),
        environment: commonEnv,
        logRetention: logs.RetentionDays.TWO_WEEKS,
        bundling: {
          // CommonJS output: bcryptjs (and other deps) use dynamic require()
          // of Node builtins like "buffer"/"crypto", which esbuild's ESM output
          // rejects at runtime ("Dynamic require of ... is not supported").
          // CJS uses Node's native require, so those work.
          format: lambdaNode.OutputFormat.CJS,
          target: "node20",
          minify: true,
          sourceMap: true,
        },
      });
      // Data-plane access. Small app: grant read/write on all tables.
      for (const t of [users, rooms, roomMembers, messages, connections]) {
        t.grantReadWriteData(fn);
      }
      imageBucket.grantReadWrite(fn);
      return fn;
    };

    // HTTP handlers
    const loginFn = makeFn("LoginFn", "http/login.ts");
    const meFn = makeFn("MeFn", "http/me.ts");
    const listUsersFn = makeFn("ListUsersFn", "http/listUsers.ts");
    const adminCreateUserFn = makeFn("AdminCreateUserFn", "http/adminCreateUser.ts");
    const listRoomsFn = makeFn("ListRoomsFn", "http/listRooms.ts");
    const createGroupFn = makeFn("CreateGroupFn", "http/createGroup.ts");
    const openDmFn = makeFn("OpenDmFn", "http/openDm.ts");
    const getMessagesFn = makeFn("GetMessagesFn", "http/getMessages.ts");
    const uploadUrlFn = makeFn("UploadUrlFn", "http/uploadUrl.ts");

    // WebSocket handlers
    const wsConnectFn = makeFn("WsConnectFn", "ws/connect.ts");
    const wsDisconnectFn = makeFn("WsDisconnectFn", "ws/disconnect.ts");
    const wsSendMessageFn = makeFn("WsSendMessageFn", "ws/sendMessage.ts");
    const wsTypingFn = makeFn("WsTypingFn", "ws/typing.ts");
    const wsHelloFn = makeFn("WsHelloFn", "ws/hello.ts");

    // ---------------------------------------------------------------
    // HTTP API
    // ---------------------------------------------------------------
    const httpApi = new apigw.HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowOrigins: ["*"],
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.OPTIONS,
        ],
      },
    });

    const route = (
      routeKey: string,
      method: apigw.HttpMethod,
      pathPart: string,
      fn: lambda.IFunction
    ) => {
      httpApi.addRoutes({
        path: pathPart,
        methods: [method],
        integration: new apigwInteg.HttpLambdaIntegration(routeKey, fn),
      });
    };

    route("Login", apigw.HttpMethod.POST, "/login", loginFn);
    route("Me", apigw.HttpMethod.GET, "/me", meFn);
    route("Users", apigw.HttpMethod.GET, "/users", listUsersFn);
    route("AdminUsers", apigw.HttpMethod.POST, "/admin/users", adminCreateUserFn);
    route("Rooms", apigw.HttpMethod.GET, "/rooms", listRoomsFn);
    route("CreateGroup", apigw.HttpMethod.POST, "/rooms", createGroupFn);
    route("OpenDm", apigw.HttpMethod.POST, "/dms", openDmFn);
    route(
      "GetMessages",
      apigw.HttpMethod.GET,
      "/rooms/{roomId}/messages",
      getMessagesFn
    );
    route("Uploads", apigw.HttpMethod.POST, "/uploads", uploadUrlFn);

    // ---------------------------------------------------------------
    // WebSocket API
    // ---------------------------------------------------------------
    const wsApi = new apigw.WebSocketApi(this, "WsApi", {
      connectRouteOptions: {
        integration: new apigwInteg.WebSocketLambdaIntegration(
          "ConnectInteg",
          wsConnectFn
        ),
      },
      disconnectRouteOptions: {
        integration: new apigwInteg.WebSocketLambdaIntegration(
          "DisconnectInteg",
          wsDisconnectFn
        ),
      },
    });
    wsApi.addRoute("sendMessage", {
      integration: new apigwInteg.WebSocketLambdaIntegration(
        "SendMessageInteg",
        wsSendMessageFn
      ),
    });
    wsApi.addRoute("typing", {
      integration: new apigwInteg.WebSocketLambdaIntegration(
        "TypingInteg",
        wsTypingFn
      ),
    });
    wsApi.addRoute("hello", {
      integration: new apigwInteg.WebSocketLambdaIntegration(
        "HelloInteg",
        wsHelloFn
      ),
    });

    const wsStage = new apigw.WebSocketStage(this, "WsStage", {
      webSocketApi: wsApi,
      stageName: "prod",
      autoDeploy: true,
    });

    // WS handlers push back to clients via the Management API.
    for (const fn of [
      wsConnectFn,
      wsDisconnectFn,
      wsSendMessageFn,
      wsTypingFn,
      wsHelloFn,
    ]) {
      wsApi.grantManageConnections(fn);
    }

    // ---------------------------------------------------------------
    // Frontend hosting: deploy INTO the existing liddle.cloud bucket under a
    // sub-folder (e.g. chat/). The rest of the site is never touched.
    // ---------------------------------------------------------------
    const siteBucket = s3.Bucket.fromBucketName(
      this,
      "ExistingSiteBucket",
      config.siteBucketName
    );

    // Runtime config the SPA fetches on load, so the build never hardcodes URLs.
    const wsUrl = wsStage.url; // wss://.../prod
    const apiUrl = httpApi.apiEndpoint; // https://xxxx.execute-api...

    // Deploy the built SPA + a generated config.json under the chat/ prefix.
    new s3deploy.BucketDeployment(this, "DeployChatSite", {
      destinationBucket: siteBucket,
      destinationKeyPrefix: config.sitePathPrefix, // -> <bucket>/chat/...
      // Do NOT prune: never delete anything else in the shared bucket. Old
      // content-hashed asset files under chat/ may linger but are harmless.
      prune: false,
      // Served straight from S3 (no CDN) — no-cache keeps index.html/config.json
      // fresh so a new deploy is picked up immediately. Assets are hashed anyway.
      cacheControl: [s3deploy.CacheControl.fromString("no-cache")],
      sources: [
        s3deploy.Source.asset(FRONTEND_DIST),
        s3deploy.Source.jsonData("config.json", { apiUrl, wsUrl }),
      ],
    });

    // ---------------------------------------------------------------
    // Seed the first admin account (custom resource)
    // ---------------------------------------------------------------
    const seedFn = makeFn("SeedAdminFn", "ops/seedAdmin.ts");
    seedFn.addEnvironment("ADMIN_USERNAME", config.adminUsername);
    seedFn.addEnvironment("ADMIN_PASSWORD", config.adminPassword);

    const seedProvider = new customResources.Provider(this, "SeedProvider", {
      onEventHandler: seedFn,
    });
    new CustomResource(this, "SeedAdmin", {
      serviceToken: seedProvider.serviceToken,
      // Re-run the seed whenever the admin username changes.
      properties: { username: config.adminUsername },
    });

    // ---------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------
    new CfnOutput(this, "SiteUrl", {
      value: config.siteBaseUrl,
      description: "Open this to use the chat app",
    });
    new CfnOutput(this, "ApiUrl", { value: apiUrl });
    new CfnOutput(this, "WebSocketUrl", { value: wsUrl });
    new CfnOutput(this, "ImageBucketName", { value: imageBucket.bucketName });
  }
}
