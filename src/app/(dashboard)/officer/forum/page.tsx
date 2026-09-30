import { headers } from "next/headers";
import { ForumView } from "@/components/shared/ForumView";
import { hasCapability, type PermissionOverrides } from "@/lib/auth/capabilities";

export default async function OfficerForumPage() {
  const h    = await headers();
  const role = h.get("x-user-role") ?? "";
  const uid  = h.get("x-user-id") ?? null;
  let permissions: PermissionOverrides = null;
  try { permissions = JSON.parse(h.get("x-user-permissions") ?? "{}"); } catch { /* trusted middleware normally supplies valid JSON */ }
  const isModerator = hasCapability(role, permissions, "communication.moderate");
  return <ForumView isModerator={isModerator} currentUserId={uid} />;
}
