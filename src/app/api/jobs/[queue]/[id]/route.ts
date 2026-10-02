import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { getJobStatus, getQueueStats } from "@/server/lib/queue-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ queue: string; id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { queue, id } = await params;

  try {
    const job = await getJobStatus(queue, id);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const jobData = job.data as { userId?: string; uploadId?: string };
    if (jobData.userId && jobData.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const upload = await import("@/server/db/client").then((m) => m.db.upload.findUnique({
      where: { id: jobData.uploadId || job.id },
    }));

    return NextResponse.json({
      job: {
        id: job.id,
        name: job.name,
        state: job.state,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        finishedOn: (job as { finishedOn?: number }).finishedOn,
        processedOn: (job as { processedOn?: number }).processedOn,
      },
      upload: upload ? {
        id: upload.id,
        status: upload.status,
        errorMessage: upload.errorMessage,
      } : null,
    });
  } catch (error) {
    console.error("[JOB_STATUS]", error);
    return NextResponse.json(
      { error: "Failed to get job status" },
      { status: 500 }
    );
  }
}
