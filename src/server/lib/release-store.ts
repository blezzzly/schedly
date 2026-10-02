import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { b2Client, B2_BUCKET } from "@/server/lib/b2-client";

export type ReleaseInfo = {
  versionCode: number;
  versionName: string;
  updateMessage: string;
};

export const VERSION_KEY = "releases/version.json";

function notFound(err: unknown): boolean {
  return (err as { name?: string }).name === "NoSuchKey";
}

/** Read releases/version.json from B2. Returns null if it does not exist. */
export async function getReleaseInfo(): Promise<ReleaseInfo | null> {
  if (!B2_BUCKET) {
    throw new Error("B2 storage not configured (B2_BUCKET missing)");
  }
  try {
    const object = await b2Client().send(
      new GetObjectCommand({ Bucket: B2_BUCKET, Key: VERSION_KEY })
    );
    if (!object.Body) return null;
    const bytes = await object.Body.transformToByteArray();
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as ReleaseInfo;
  } catch (err) {
    if (notFound(err)) return null;
    throw err;
  }
}

/** Write releases/version.json to B2. */
export async function putReleaseInfo(info: ReleaseInfo): Promise<void> {
  if (!B2_BUCKET) {
    throw new Error("B2 storage not configured (B2_BUCKET missing)");
  }
  await b2Client().send(
    new PutObjectCommand({
      Bucket: B2_BUCKET,
      Key: VERSION_KEY,
      Body: JSON.stringify(info, null, 2),
      ContentType: "application/json",
    })
  );
}
