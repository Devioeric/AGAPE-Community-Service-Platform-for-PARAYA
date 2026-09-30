import { redirect } from "next/navigation";

export default function CommunityNeedsReviewRedirect() {
  redirect("/officer/community-needs?status=pending_paraya_review");
}
