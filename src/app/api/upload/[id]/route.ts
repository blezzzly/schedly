import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { uploadRepository } from "@/server/repositories/upload.repository";
import { friendlyError } from "@/server/lib/friendly-error";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let upload = await uploadRepository.findById(id);

  if (!upload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (upload.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Extraction runs as a background job. The worker can crash, lose connection
  // to Redis, or simply get stuck — guard against any of those by checking
  // the upload's age and (when possible) the queue's reported state.
  if (upload.status === "processing") {
    const ageMs = Date.now() - upload.createdAt.getTime();
    // Allow a generous window for slow OCR/AI runs plus cold starts.
    // If the upload is still "processing" after 15 minutes, something is
    // genuinely wrong — fail it so the user isn't stuck polling forever.
    if (ageMs > 15 * 60_000) {
      console.warn(`[UPLOAD_STATUS] Marking stale upload ${upload.id} as failed (age=${ageMs}ms)`);
      upload = await uploadRepository.updateStatus(
        upload.id,
        "failed",
        friendlyError("Processing timed out", "schedule"),
      );
    }
  }

  return NextResponse.json({
    uploadId: upload.id,
    status: upload.status,
    fileUrl: upload.fileUrl,
    errorMessage: upload.status === "failed" ? friendlyError(upload.errorMessage, "schedule") : undefined,
    classes: (upload.aiResult as Record<string, unknown> | null)?.classes ?? [],
    metadata: (upload.aiResult as Record<string, unknown> | null)?.metadata ?? {
      totalClasses: 0,
      confidence: 0,
      notes: null,
    },
  });
}
