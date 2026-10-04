import { CalendarRange, FileSignature, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SEV_VARIANT } from "@/lib/severity";
import type { RegisterEntry } from "@/lib/types";
import { fmtDate } from "@/lib/utils";
import { QuoteBlock } from "./FindingCard";

export function RegisterView({ entries }: { entries: RegisterEntry[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">What AtliQ has already promised</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {entries.length} obligations from the 17 signed contracts, each quoting its clause. The tracker's restrictive-clauses column is blank or "none" for every one of them.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {entries.map((e) => (
          <Card key={e.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{e.id} · {e.type}</p>
                <p className="font-semibold leading-snug">{e.counterparty}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Badge variant={SEV_VARIANT[e.severity]}>{e.severity}</Badge>
                <Badge variant={e.active ? "primary" : "info"}>{e.active ? "Active" : "Expired"}</Badge>
              </div>
            </div>
            <p className="text-sm leading-relaxed">{e.plain_english}</p>
            <QuoteBlock text={e.quote} />
            <div className="mt-auto space-y-1 text-xs text-muted-foreground">
              <p className="flex gap-1.5"><Link2 className="size-3.5 shrink-0" /> Binds: {e.binds}</p>
              <p className="flex gap-1.5"><CalendarRange className="size-3.5 shrink-0" /> {e.ends ? `In force until ${fmtDate(e.ends)}` : "No end date"} · {e.ends_note}</p>
              <p className="flex gap-1.5"><FileSignature className="size-3.5 shrink-0" /> {e.source_file} cl. {e.clause}</p>
              {e.exceptions && <p className="rounded bg-muted p-2 text-foreground/80">Exceptions: {e.exceptions}</p>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
