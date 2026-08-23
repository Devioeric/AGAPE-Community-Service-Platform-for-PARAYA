"use client";

import { MyBarangayView } from "@/components/shared/MyBarangayView";

export default function BarangayPartnershipPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">Our Partnership</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your barangay&apos;s registered profile, contact information, and partnership history with PARAYA. Edits are managed by PARAYA officers.
        </p>
      </div>
      <MyBarangayView
        emptyMessage="Your account isn't linked to a barangay yet. Contact a PARAYA officer or system administrator."
      />
    </div>
  );
}
