import { BookMarked, FileSearch, Inbox, Info, Loader2, Moon, RotateCw, Settings2, Sun, WifiOff, X, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AboutView } from "@/components/AboutView";
import { ContractPicker } from "@/components/ContractPicker";
import { QueueView } from "@/components/QueueView";
import { RegisterView } from "@/components/RegisterView";
import { ReportView } from "@/components/ReportView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/textarea";
import { type Client, connect, getAccessToken, getApiUrl, setAccessToken, setApiUrl } from "@/lib/api";
import { createLatestGuard } from "@/lib/latest";
import { MODE_LABEL } from "@/lib/modes";
import { mergeWarnings } from "@/lib/warning";
import type { Draft, Health, Mode, QueueRow, RegisterEntry, Report } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ReviewSource = { draft?: string; text?: string; filename?: string };
type Fetch = (mode: Mode, signal: AbortSignal) => Promise<Report>;

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("atliq.theme");
      if (saved) return saved === "dark";
    } catch {
      /* ignore */
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("atliq.theme", dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);
  return [dark, setDark] as const;
}

export default function App() {
  const [dark, setDark] = useTheme();
  const [client, setClient] = useState<Client>();
  const [health, setHealth] = useState<Health>();
  const [notice, setNotice] = useState<string>();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [register, setRegister] = useState<RegisterEntry[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [mode, setMode] = useState<Mode>("judge");
  const [report, setReport] = useState<Report>();
  const [source, setSource] = useState<ReviewSource>({});
  const [busy, setBusy] = useState(false);
  // "rules": waiting for the first (deterministic) result; "ai": rules are on screen, the AI stages are still running.
  const [stage, setStage] = useState<"rules" | "ai">();
  const [reportKey, setReportKey] = useState(0);
  const [error, setError] = useState<string>();
  const [bootError, setBootError] = useState<string>();
  const [tab, setTab] = useState("review");
  const [showSettings, setShowSettings] = useState(false);
  const [apiInput, setApiInput] = useState(getApiUrl());
  const [tokenInput, setTokenInput] = useState(getAccessToken());
  const reportRef = useRef<HTMLElement>(null);
  const [guard] = useState(createLatestGuard);
  const runCount = useRef(0);

  const boot = useCallback(async () => {
    setClient(undefined);
    setBootError(undefined);
    try {
      const { client, health, fallbackReason } = await connect();
      const [d, r, q] = await Promise.all([client.drafts(), client.register(), client.queue()]);
      setDrafts(d);
      setRegister(r);
      setQueue(q);
      setHealth(health);
      setNotice(fallbackReason);
      setMode(client.live ? (health.modes.includes("judge") ? "judge" : "rules") : "demo");
      setClient(client);
      return { client, drafts: d };
    } catch (e) {
      setBootError((e as Error).message || "The review service did not answer.");
      return undefined;
    }
  }, []);

  /**
   * Run a review. In the AI modes the deterministic report is fetched first and shown at once,
   * then the AI result replaces it. Only the latest run may update the screen (see createLatestGuard).
   */
  const run = useCallback(
    async (c: Client, want: Mode, first: Fetch, src?: ReviewSource) => {
      const t = guard.start();
      const progressive = c.live && (want === "judge" || want === "single");
      setBusy(true);
      setStage("rules");
      setError(undefined);
      setTab("review");
      try {
        const r = await first(progressive ? "rules" : want, t.signal);
        if (!t.isCurrent()) return;
        const s: ReviewSource = src ?? { text: r.text, filename: r.filename };
        setReport(r);
        setSource(s);
        setReportKey(++runCount.current);
        if (window.scrollY > 0 || window.innerWidth < 1024) reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (progressive) {
          setStage("ai");
          const full = s.draft
            ? await c.analyzeDraft(s.draft, want, t.signal)
            : await c.analyzeText(s.text ?? "", s.filename ?? r.filename, want, t.signal);
          if (!t.isCurrent()) return;
          setReport({ ...full, warning: mergeWarnings(full.warning, r.warning) });
        }
      } catch (e) {
        if (t.isCurrent()) setError((e as Error).message);
      } finally {
        if (t.isCurrent()) {
          setBusy(false);
          setStage(undefined);
        }
      }
    },
    [guard],
  );

  const cancel = () => {
    guard.cancel();
    setBusy(false);
    setStage(undefined);
  };

  const rerun = (m: Mode) => {
    if (!client) return;
    if (source.draft) run(client, m, (mm, sig) => client.analyzeDraft(source.draft!, mm, sig), source);
    else if (source.text) run(client, m, (mm, sig) => client.analyzeText(source.text!, source.filename ?? "pasted contract", mm, sig), source);
  };

  useEffect(() => {
    boot().then((res) => {
      if (!res) return;
      const { client, drafts } = res;
      const first = drafts.find((d) => d.filename.includes("gulf_crown")) ?? drafts[0];
      // Rules only on load, so opening the page never spends the API key. The report shows its own mode.
      if (first) run(client, client.live ? "rules" : "demo", (m, sig) => client.analyzeDraft(first.filename, m, sig), { draft: first.filename });
    });
  }, [boot, run]);

  if (bootError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">Could not load the review service</p>
        <p className="max-w-sm text-sm text-muted-foreground">{bootError}</p>
        <Button onClick={() => boot()}>
          <RotateCw /> Retry
        </Button>
      </div>
    );
  }

  if (!client || !health) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="font-medium">Connecting to the review service…</p>
        <p className="max-w-sm text-sm text-muted-foreground">A free-tier backend can take up to a minute to wake up. The offline demo loads if it does not answer.</p>
      </div>
    );
  }

  const modes: Mode[] = client.live ? health.modes : ["demo"];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileSearch className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold sm:text-base">AtliQ Contract Risk Analyzer</h1>
            <p className="truncate text-xs text-muted-foreground">Know what you are signing · dataset date 28 Sep 2026 · not legal advice</p>
          </div>
          <Badge variant={client.live ? "primary" : "info"} className="hidden sm:inline-flex">
            {client.live ? <Zap /> : <WifiOff />} {client.live ? (health.llm_available ? "Live · AI on" : "Live · rules only") : "Offline demo"}
          </Badge>
          <Button variant="ghost" size="icon" aria-label="Backend settings" onClick={() => setShowSettings((s) => !s)}>
            <Settings2 />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={() => setDark(!dark)}>
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
        {showSettings && (
          <div className="border-t border-border bg-card">
            <form
              className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault();
                setApiUrl(apiInput);
                setAccessToken(tokenInput);
                setApiInput(getApiUrl());
                setShowSettings(false);
                guard.cancel();
                setBusy(false);
                setStage(undefined);
                setReport(undefined);
                setSource({});
                boot();
              }}
            >
              <label className="text-xs font-medium text-muted-foreground sm:w-40">Backend URL (FastAPI)</label>
              <Input placeholder="https://your-api.onrender.com · empty = build default · demo = offline" value={apiInput} onChange={(e) => setApiInput(e.target.value)} />
              <Input
                type="password"
                autoComplete="off"
                className="sm:max-w-56"
                placeholder="Access token (AI modes)"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              <Button type="submit" size="sm">Connect</Button>
            </form>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        {notice && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <Info className="mt-0.5 size-4 shrink-0" /> {notice}
          </div>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <div className="-mx-4 mb-5 overflow-x-auto px-4">
            <TabsList>
              <TabsTrigger value="review"><FileSearch /> Review</TabsTrigger>
              <TabsTrigger value="register"><BookMarked /> Register</TabsTrigger>
              <TabsTrigger value="queue"><Inbox /> Queue</TabsTrigger>
              <TabsTrigger value="about"><Info /> How it works</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="review">
            <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
              <aside className="min-w-0 space-y-3 lg:sticky lg:top-20 lg:self-start">
                <Card className="p-3">
                  <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Review mode</p>
                  <div className="flex flex-wrap gap-1.5">
                    {modes.map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          mode === m ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                        )}
                      >
                        {MODE_LABEL[m]}
                      </button>
                    ))}
                  </div>
                  {!client.live && (
                    <p className="mt-2 px-1 text-xs text-muted-foreground">Real rule, register and document-set results for all 15 drafts. Drafts marked with a gavel include a sample LLM-as-Judge run.</p>
                  )}
                  {client.live && !health.llm_available && (
                    <p className="mt-2 px-1 text-xs text-muted-foreground">Set GROQ_API_KEY on the backend to enable the AI review modes.</p>
                  )}
                  {client.live && health.token_required && !getAccessToken() && (
                    <p className="mt-2 px-1 text-xs text-muted-foreground">The AI modes need the access token. Add it with the settings button at the top.</p>
                  )}
                </Card>
                <ContractPicker
                  drafts={drafts}
                  selected={source.draft}
                  live={client.live}
                  busy={busy}
                  onDraft={(f) => run(client, mode, (m, sig) => client.analyzeDraft(f, m, sig), { draft: f })}
                  onFile={(file) => run(client, mode, (m, sig) => client.analyzeFile(file, m, sig))}
                  onText={(text, name) => run(client, mode, (m, sig) => client.analyzeText(text, name, m, sig), { text, filename: name })}
                />
              </aside>
              <section ref={reportRef} className="min-w-0 scroll-mt-20">
                {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
                {busy && (
                  <Card className="mb-4 flex items-center gap-3 p-4 text-sm">
                    <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
                    <span className="flex-1">
                      {stage === "ai"
                        ? mode === "judge"
                          ? "Rule, register and document-set results are below. The extractor and the judge are still reviewing…"
                          : "Rule, register and document-set results are below. the AI is still reviewing…"
                        : "Running the playbook rules, register and document-set checks…"}
                    </span>
                    <Button variant="ghost" size="sm" onClick={cancel}>
                      <X /> Cancel
                    </Button>
                  </Card>
                )}
                {report ? (
                  <div className={cn(stage === "rules" && "pointer-events-none opacity-50")}>
                    <ReportView
                      key={reportKey}
                      report={report}
                      client={client}
                      source={source}
                      selectedMode={mode}
                      canRerun={!busy && client.live && modes.includes(mode) && Boolean(source.draft || source.text)}
                      onRerun={() => rerun(mode)}
                    />
                  </div>
                ) : (
                  !busy && <Card className="p-10 text-center text-sm text-muted-foreground">Pick a draft, upload a contract or paste its text.</Card>
                )}
              </section>
            </div>
          </TabsContent>
          <TabsContent value="register">
            <RegisterView entries={register} />
          </TabsContent>
          <TabsContent value="queue">
            <QueueView rows={queue} busy={busy} onOpen={(d) => run(client, mode, (m, sig) => client.analyzeDraft(d, m, sig), { draft: d })} />
          </TabsContent>
          <TabsContent value="about">
            <AboutView health={health} />
          </TabsContent>
        </Tabs>
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-2 text-center text-xs text-muted-foreground">
        Codebasics AI PM capstone · synthetic data only · {MODE_LABEL[mode]}
      </footer>
    </div>
  );
}
