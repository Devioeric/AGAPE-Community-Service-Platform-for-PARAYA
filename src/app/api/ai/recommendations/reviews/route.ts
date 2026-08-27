import { NextResponse } from "next/server";
import { z } from "zod";

import { recommendationDismissalReasonSchema } from "@/lib/ai/advisory-recommendations";
import { authorizeCapability } from "@/lib/auth/authorize";

const reviewRequestSchema = z.object({
  needId: z.string().uuid(),
  recommendationFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  action: z.enum(["endorsed", "dismissed"]),
  reasonCode: recommendationDismissalReasonSchema.nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "dismissed" && !value.reasonCode) {
    ctx.addIssue({ code: "custom", path: ["reasonCode"], message: "Dismissal requires a reason" });
  }
  if (value.action === "endorsed" && value.reasonCode) {
    ctx.addIssue({ code: "custom", path: ["reasonCode"], message: "Endorsement cannot include a dismissal reason" });
  }
});

function rpcError(error: { message?: string; code?: string } | null) {
  const status = error?.code === "42501" ? 403
    : error?.code === "P0002" ? 404
      : error?.code === "40001" || error?.code === "23505" ? 409
        : error?.code === "22023" || error?.code === "23514" ? 422
          : 500;
  return NextResponse.json({ error: error?.message ?? "Recommendation review failed" }, { status });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("ai.recommendation.review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = reviewRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid recommendation review", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("phase3_record_recommendation_review", {
    p_need_id: parsed.data.needId,
    p_recommendation_fingerprint: parsed.data.recommendationFingerprint,
    p_action: parsed.data.action,
    p_reason_code: parsed.data.reasonCode ?? null,
  });
  if (error) return rpcError(error);

  return NextResponse.json(
    { data },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
