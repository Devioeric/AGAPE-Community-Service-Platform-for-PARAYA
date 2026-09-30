import { Suspense } from "react";
import { ContributorProposalsBoard } from "@/components/contributor/ContributorProposalsBoard";

// The board reads ?new=1 and ?open=<id> links from the dashboard.
export default function ContributorProposalsPage() {
  return (
    <Suspense>
      <ContributorProposalsBoard />
    </Suspense>
  );
}
