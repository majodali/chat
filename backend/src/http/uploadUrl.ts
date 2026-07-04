// POST /uploads { contentType } -> { uploadUrl, key }
// Returns a presigned S3 PUT url so the browser uploads the image directly.
import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../lib/env";
import {
  getAuth,
  ok,
  badRequest,
  unauthorized,
  parseBody,
  serverError,
} from "../lib/http";

const s3 = new S3Client({ region: env.region });

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const handler: APIGatewayProxyHandlerV2 = async (
  event: APIGatewayProxyEventV2
) => {
  try {
    const auth = getAuth(event);
    if (!auth) return unauthorized();

    const { contentType } = parseBody<{ contentType?: string }>(event);
    if (!contentType || !ALLOWED[contentType]) {
      return badRequest("Only JPEG, PNG, GIF or WebP images are allowed");
    }

    const ext = ALLOWED[contentType];
    const key = `uploads/${auth.sub}/${randomUUID()}.${ext}`;

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: env.imageBucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 60 * 5 } // 5 minutes to complete the upload
    );

    return ok({ uploadUrl, key });
  } catch (err) {
    console.error("uploadUrl error", err);
    return serverError();
  }
};
