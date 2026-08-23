import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { notify } from "@/lib/notifications/dispatch";
import {
  isProgramSignupUuid,
  parseProgramSignupRequestBody,
} from "@/lib/programs/signup-contract";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeAnyCapability(["volunteer.self", "volunteer.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabase = auth.supabase;
  const userId = auth.actor.id;

  const { id } = await params;
  const parsed = parseProgramSignupRequestBody(await request.text());
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const targetId = parsed.volunteerId;

  if (targetId && targetId !== userId) {
    if (!hasCapability(auth.actor.role, auth.actor.permissions, "volunteer.manage")) {
      return NextResponse.json(
        { error: "Only PARAYA staff can assign volunteers." },
        { status: 403 },
      );
    }

    const admin = createAdminClient();
    const confirmedAt = new Date().toISOString();
    const { data: target } = await admin
      .from("users")
      .select("id, role, status, is_active")
      .eq("id", targetId)
      .single();
    if (
      !target ||
      target.role !== "volunteer" ||
      target.status !== "active" ||
      target.is_active !== true
    ) {
      return NextResponse.json(
        { error: "Target user is not an active Volunteer." },
        { status: 400 },
      );
    }

    const { data, error } = await admin
      .from("program_signups")
      .upsert(
        {
          program_id: id,
          volunteer_id: targetId,
          status: "confirmed",
          approval_status: "approved",
          added_by: userId,
          confirmed_at: confirmedAt,
          approved_by: userId,
          approved_at: confirmedAt,
          approval_notes: null,
        },
        { onConflict: "program_id,volunteer_id" },
      )
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: program } = await admin
      .from("programs")
      .select("title")
      .eq("id", id)
      .single();
    notify({
      user_id: targetId,
      title: "You've been assigned to a program",
      message: `An officer added you to "${program?.title ?? "a program"}". Open it from your Programs page.`,
      type: "info",
      action_url: "/volunteer/programs",
    }).catch(() => {});

    return NextResponse.json({ data }, { status: 201 });
  }

  if (!hasCapability(auth.actor.role, auth.actor.permissions, "volunteer.self")) {
    return NextResponse.json(
      { error: "Only Volunteer accounts can join a program." },
      { status: 403 },
    );
  }

  const { data: existing } = await supabase
    .from("program_signups")
    .select("id, status")
    .eq("program_id", id)
    .eq("volunteer_id", userId)
    .single();
  if (existing && existing.status !== "withdrawn") {
    return NextResponse.json({ error: "Already signed up" }, { status: 409 });
  }

  // A withdrawn signup already occupies the unique program/volunteer key.
  // Reactivation changes protected lifecycle state, so keep it behind this
  // authenticated route and a conditional trusted write instead of allowing a
  // broad direct upsert through volunteer RLS.
  if (existing?.status === "withdrawn") {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("program_signups")
      .update({
        status: "pending",
        approval_status: "approved",
        added_by: null,
        confirmed_at: null,
        approved_by: null,
        approved_at: null,
        approval_notes: null,
        signed_up_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("volunteer_id", userId)
      .eq("status", "withdrawn")
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Signup state changed. Reload and try again." },
        { status: 409 },
      );
    }
    return NextResponse.json({ data }, { status: 201 });
  }

  const { data, error } = await supabase
    .from("program_signups")
    .insert({
      program_id: id,
      volunteer_id: userId,
      status: "pending",
      approval_status: "approved",
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already signed up" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await authorizeAnyCapability(["volunteer.self", "volunteer.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabase = auth.supabase;
  const userId = auth.actor.id;

  const { id } = await params;
  const targetId = new URL(request.url).searchParams.get("volunteer_id");
  if (targetId && targetId !== userId) {
    if (!isProgramSignupUuid(targetId)) {
      return NextResponse.json({ error: "volunteer_id must be a UUID." }, { status: 400 });
    }
    if (!hasCapability(auth.actor.role, auth.actor.permissions, "volunteer.manage")) {
      return NextResponse.json(
        { error: "Only PARAYA staff can remove volunteers." },
        { status: 403 },
      );
    }
    const admin = createAdminClient();
    const { error } = await admin
      .from("program_signups")
      .update({ status: "withdrawn" })
      .eq("program_id", id)
      .eq("volunteer_id", targetId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (!hasCapability(auth.actor.role, auth.actor.permissions, "volunteer.self")) {
    return NextResponse.json(
      { error: "Only Volunteer accounts can withdraw themselves." },
      { status: 403 },
    );
  }
  const { error } = await supabase
    .from("program_signups")
    .update({ status: "withdrawn" })
    .eq("program_id", id)
    .eq("volunteer_id", userId)
    .in("status", ["pending", "confirmed"]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
