import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { notify } from "@/lib/notifications/dispatch";
import { isProgramSignupUuid, parseProgramSignupRequestBody } from "@/lib/programs/signup-contract";
import { programOperationError } from "@/lib/programs/operation-error";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeAnyCapability(["volunteer.self", "volunteer.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  const { id } = await params;
  if (!isProgramSignupUuid(id)) return NextResponse.json({ error: "Program ID must be a UUID." }, { status: 400, headers });
  const parsed = parseProgramSignupRequestBody(await request.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers });
  const targetId = parsed.volunteerId ?? auth.actor.id;
  const isAssignment = targetId !== auth.actor.id;
  if (!hasCapability(auth.actor.role, auth.actor.permissions, isAssignment ? "volunteer.manage" : "volunteer.self")) {
    return NextResponse.json({ error: "This account cannot change this signup." }, { status: 403, headers });
  }
  // The authenticated RPC rechecks capability, active target, lifecycle,
  // applicable V2 eligibility and capacity under one shared parent-row lock.
  const { data: result, error } = await auth.supabase.rpc("phase8_set_program_signup", {
    p_program_id: id, p_volunteer_id: targetId, p_action: "join",
  });
  if (error) {
    const failure = programOperationError(error, "signup");
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers });
  }
  if (isAssignment && result?.changed) {
    await notify({
      user_id: targetId,
      title: "You've been assigned to a program",
      message: `An officer added you to "${result.programTitle ?? "a program"}". Open it from your Programs page.`,
      type: "info", action_url: "/volunteer/programs",
    }).catch(() => undefined);
  }
  return NextResponse.json({ data: result?.signup }, { status: result?.changed ? 201 : 200, headers });
}

export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await authorizeAnyCapability(["volunteer.self", "volunteer.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  const { id } = await params;
  const targetId = new URL(request.url).searchParams.get("volunteer_id") ?? auth.actor.id;
  if (!isProgramSignupUuid(id) || !isProgramSignupUuid(targetId)) {
    return NextResponse.json({ error: "Program and volunteer IDs must be UUIDs." }, { status: 400, headers });
  }
  if (!hasCapability(auth.actor.role, auth.actor.permissions, targetId !== auth.actor.id ? "volunteer.manage" : "volunteer.self")) {
    return NextResponse.json({ error: "This account cannot change this signup." }, { status: 403, headers });
  }
  const { error } = await auth.supabase.rpc("phase8_set_program_signup", {
    p_program_id: id, p_volunteer_id: targetId, p_action: "withdraw",
  });
  if (error) {
    const failure = programOperationError(error, "signup");
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers });
  }
  return NextResponse.json({ success: true }, { headers });
}
