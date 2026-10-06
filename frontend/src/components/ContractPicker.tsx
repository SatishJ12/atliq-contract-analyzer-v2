import { CalendarClock, ClipboardPaste, FileText, Gavel, Inbox, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/textarea";
import type { Draft } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

type Source = "draft" | "upload" | "paste";

export function ContractPicker({
  drafts, selected, live, busy, onDraft, onFile, onText,
}: {
  drafts: Draft[];
  selected?: string;
  live: boolean;
  busy: boolean;
  onDraft: (filename: string) => void;
  onFile: (file: File) => void;
  onText: (text: string, name: string) => void;
}) {
  const [source, setSource] = useState<Source>("draft");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const tabs: { id: Source; label: string; icon: typeof Inbox }[] = [
    { id: "draft", label: "Drafts", icon: Inbox },
    { id: "upload", label: "Upload", icon: Upload },
    { id: "paste", label: "Paste", icon: ClipboardPaste },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-3 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSource(t.id)}
            className={cn(
              "flex items-center justify-center gap-1.5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              source === t.id && "border-b-2 border-primary text-foreground",
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {source === "draft" && (
        <div className="max-h-72 overflow-y-auto sm:max-h-[28rem] p-2 lg:max-h-[calc(100vh-14rem)]">
          <p className="px-2 pb-2 pt-1 text-xs text-muted-foreground">13 drafts awaiting Karandeep, soonest deadline first</p>
          {[...drafts]
            .sort((a, b) => (a.deadline ?? "9") .localeCompare(b.deadline ?? "9"))
            .map((d) => (
              <button
                key={d.filename}
                onClick={() => onDraft(d.filename)}
                disabled={busy}
                className={cn(
                  "mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
                  selected === d.filename && "bg-accent ring-1 ring-primary/30",
                )}
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {d.label}
                    {d.has_judge_sample && <Gavel className="size-3.5 shrink-0 text-violet-500" aria-label="Includes LLM-as-Judge sample" />}
                  </span>
                  {d.deadline && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock className="size-3" /> Due {fmtDate(d.deadline).replace(/ \d{4}$/, "")}
                    </span>
                  )}
                </span>
                {d.high > 0 ? <Badge variant="high">{d.high} High</Badge> : <Badge variant="info">No High</Badge>}
              </button>
            ))}
        </div>
      )}

      {source === "upload" && (
        <div className="p-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f && live && !busy) onFile(f);
            }}
            onClick={() => live && !busy && fileRef.current?.click()}
            aria-disabled={!live || busy}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-accent/40",
              drag && "border-primary bg-accent",
              (!live || busy) && "cursor-not-allowed opacity-60",
            )}
          >
            {busy ? <Loader2 className="size-8 animate-spin text-primary" /> : <Upload className="size-8 text-primary" />}
            <p className="text-sm font-medium">Drop a contract here or click to browse</p>
            <p className="text-xs text-muted-foreground">PDF, Word (.docx), .txt or .md · up to 10 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {!live && <p className="mt-3 text-xs text-muted-foreground">Uploading needs the live backend. The offline demo covers the 13 incoming drafts.</p>}
        </div>
      )}

      {source === "paste" && (
        <form
          className="space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && !busy) onText(text, name.trim() || "pasted contract");
          }}
        >
          <Input placeholder="Name (optional), e.g. Acme MSA v3" value={name} onChange={(e) => setName(e.target.value)} disabled={!live} />
          <Textarea
            rows={12}
            placeholder={live ? "Paste the full contract text…" : "Pasting needs the live backend."}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!live}
          />
          <Button type="submit" className="w-full" disabled={!live || busy || !text.trim()}>
            {busy && <Loader2 className="animate-spin" />} Review contract
          </Button>
        </form>
      )}
    </Card>
  );
}
