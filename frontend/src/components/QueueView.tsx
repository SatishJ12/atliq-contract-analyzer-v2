import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { QueueRow } from "@/lib/types";
import { fmtDate, fmtUsd } from "@/lib/utils";

const LEVEL: Record<string, "high" | "medium" | "low"> = { blockers: "high", negotiate: "medium", clear: "low" };

export function QueueView({ rows, busy, onOpen }: { rows: QueueRow[]; busy: boolean; onOpen: (draft: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Contracts waiting on Karandeep</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tracker rows in review, draft or with a blank status, by the deadline found in the notes, with a rules-only scan of each draft.</p>
      </div>
      <div className="grid gap-3">
        {rows.map((r) => (
          <Card key={r.contract_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">{r.contract_id}</span>
                <span className="font-semibold">{r.counterparty}</span>
                <Badge>{r.doc_type}</Badge>
                {r.atliq_entity && <Badge>{r.atliq_entity}</Badge>}
                {r.client_country && <Badge>{r.client_country}</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{r.notes || "No notes"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {r.scan_level ? <Badge variant={LEVEL[r.scan_level]}>{r.scan_verdict}</Badge> : <Badge variant="info">{r.scan_verdict}</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
              <p className="text-sm"><span className="text-muted-foreground">Due </span><span className="font-semibold">{r.deadline ? fmtDate(r.deadline) : "—"}</span></p>
              <p className="text-sm"><span className="text-muted-foreground">Value </span><span className="font-semibold">{fmtUsd(r.value_usd)}</span></p>
              {r.draft && (
                <Button size="sm" variant="subtle" disabled={busy} onClick={() => onOpen(r.draft!)}>
                  Review <ArrowRight />
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
