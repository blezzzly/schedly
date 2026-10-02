import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { friendlyError } from "@/server/lib/friendly-error";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;

  const upload = await db.upload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      status: true,
      errorMessage: true,
      aiResult: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status === "completed") {
    const aiResult = upload.aiResult as { cards?: Array<{ question: string; answer: string }> } | null;
    return NextResponse.json({
      status: upload.status,
      cards: aiResult?.cards || [],
      message: "Flashcard generation completed successfully",
    });
  }

  if (upload.status === "failed") {
    return NextResponse.json({
      status: upload.status,
      error: friendlyError(upload.errorMessage, "flashcard"),
      message: "Flashcard generation failed",
    });
  }

  return NextResponse.json({
    status: upload.status,
    message: "Flashcard generation is in progress. Please check back soon.",
  });
}
