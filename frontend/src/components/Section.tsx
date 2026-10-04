import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function Section({
  icon, title, subtitle, count, tone = "default", defaultOpen = true, children, id,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  count?: ReactNode;
  tone?: "default" | "danger" | "ai";
  defaultOpen?: boolean;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} id={id} className="rounded-lg border border-border bg-card shadow-sm">
      <CollapsibleTrigger className="group flex w-full items-center gap-3 rounded-lg p-4 text-left hover:bg-muted/50 sm:p-5">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md [&_svg]:size-5",
            tone === "danger" && "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300",
            tone === "ai" && "bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300",
            tone === "default" && "bg-accent text-primary",
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 font-semibold">
            {title}
            {count}
          </span>
          {subtitle && <span className="mt-0.5 block text-sm text-muted-foreground">{subtitle}</span>}
        </span>
        <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border p-4 sm:p-5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}
