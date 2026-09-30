import { AlertCircle, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CommunityNeedRow } from "./NeedCard";

export function NeedDecisionDialog({
  need,
  action,
  notes,
  submitting,
  onNotesChange,
  onClose,
  onSubmit,
}: {
  need: CommunityNeedRow | null;
  action: "reject" | "needs_revision";
  notes: string;
  submitting: boolean;
  onNotesChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const revising = action === "needs_revision";
  return (
    <Dialog open={Boolean(need)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            {revising ? <AlertCircle className="h-4 w-4 text-info" /> : <XCircle className="h-4 w-4 text-danger" />}
            {revising ? "Request Revision" : "Reject Need"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {need && <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{need.title}</span> — the submitter will receive your reason.</p>}
          <div className="space-y-1.5">
            <Label htmlFor="need-decision-notes">{revising ? "What needs to be revised?" : "Reason for rejection"}<span className="ml-1 text-danger">*</span></Label>
            <Textarea id="need-decision-notes" rows={4} minLength={3} maxLength={1000} value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder={revising ? "Explain what must be clarified or added." : "Explain why this need cannot be approved."} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} disabled={submitting || notes.trim().length < 3} className={revising ? "bg-info text-white hover:bg-info/90" : "bg-danger text-white hover:bg-danger/90"}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{revising ? "Send for Revision" : "Confirm Rejection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
