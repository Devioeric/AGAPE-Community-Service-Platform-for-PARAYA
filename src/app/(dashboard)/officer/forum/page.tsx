import { headers } from "next/headers";
import { ForumView } from "@/components/shared/ForumView";

export default async function OfficerForumPage() {
  const h    = await headers();
  const role = h.get("x-user-role") ?? "";
  const uid  = h.get("x-user-id") ?? null;
  const isModerator = ["paraya_officer", "admin"].includes(role);
  return <ForumView isModerator={isModerator} currentUserId={uid} />;
}
