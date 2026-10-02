import { S3Client } from "@aws-sdk/client-s3";

const B2_KEY_ID = process.env.B2_APPLICATION_KEY_ID;
const B2_KEY = process.env.B2_APPLICATION_KEY;
export const B2_BUCKET = process.env.B2_BUCKET;
export const B2_ENDPOINT = process.env.B2_ENDPOINT ?? "s3.us-east-005.backblazeb2.com";

export function b2Client(): S3Client {
  if (!B2_KEY_ID || !B2_KEY) {
    throw new Error("B2 credentials missing (B2_APPLICATION_KEY_ID / B2_APPLICATION_KEY)");
  }
  return new S3Client({
    region: "us-east-005",
    endpoint: `https://${B2_ENDPOINT}`,
    forcePathStyle: true,
    credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_KEY },
  });
}