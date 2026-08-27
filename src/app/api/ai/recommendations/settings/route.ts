import { NextResponse } from "next/server";

import {
  recommendationSettingsDtoSchema,
  recommendationSettingsUpdateSchema,
} from "@/lib/ai/recommendation-settings";
import { authorizeCapability } from "@/lib/auth/authorize";

function rpcError(error: { message?: string; code?: string } | null) {
  const status = error?.code === "42501" ? 403
    : error?.code === "P0002" ? 404
      : error?.code === "40001" ? 409
        : error?.code === "22023" || error?.code === "23514" ? 422
          : 500;
  return NextResponse.json({ error: error?.message ?? "Recommendation settings update failed" }, { status });
}

export async function PUT(request: Request) {
  const auth = await authorizeCapability("ai.recommendation.configure");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = recommendationSettingsUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid recommendation settings", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("phase3_update_recommendation_settings", {
    p_sufficient_coverage_percent: parsed.data.sufficientCoveragePercent,
    p_expected_version: parsed.data.expectedVersion,
  });
  if (error) return rpcError(error);
  const result = recommendationSettingsDtoSchema.safeParse(data);
  if (!result.success) return NextResponse.json({ error: "Recommendation settings result was invalid" }, { status: 500 });

  return NextResponse.json(
    { data: result.data },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
