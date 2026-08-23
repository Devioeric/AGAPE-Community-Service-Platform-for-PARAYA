import { createClient } from "@/lib/supabase/server";
import { hasCapability, type Capability } from "@/lib/auth/capabilities";
import { isActiveAccount } from "@/lib/auth/account-status";

export type AuthorizedActor = {
  id: string;
  email: string | null;
  role: string;
  barangayId: string | null;
  permissions: Record<string, boolean>;
};

export type AuthorizationResult =
  | { ok: true; actor: AuthorizedActor; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; status: 401 | 403; error: string };

export async function authorizeCapability(capability: Capability): Promise<AuthorizationResult> {
  return authorizeAnyCapability([capability]);
}

export async function authorizeAnyCapability(capabilities: readonly Capability[]): Promise<AuthorizationResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("users")
    .select("role, barangay_id, permissions, status, is_active")
    .eq("id", user.id)
    .single();
  if (!profile || !isActiveAccount(profile) || !capabilities.some((capability) => hasCapability(profile.role, profile.permissions, capability))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const activeProfile = profile;

  return {
    ok: true,
    supabase,
    actor: {
      id: user.id,
      email: user.email ?? null,
      role: activeProfile.role,
      barangayId: activeProfile.barangay_id ?? null,
      permissions: activeProfile.permissions ?? {},
    },
  };
}
