import { Check, Loader2, PenLine, Send, ShieldCheck, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { TxStage } from "@/lib/genlayer";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TxState {
  active: boolean;
  stage: TxStage;
  message: string;
  hash?: string;
  error?: string;
}

const ORDER: TxStage[] = ["signing", "submitted", "accepted", "finalized"];

const STEP_LABEL: Record<TxStage, string> = {
  signing: "Sign",
  submitted: "Submit",
  accepted: "Accepted",
  finalized: "Finalized",
  error: "Error",
};

const STEP_ICON: Record<TxStage, ReactNode> = {
  signing: <PenLine className="size-4" />,
  submitted: <Send className="size-4" />,
  accepted: <ShieldCheck className="size-4" />,
  finalized: <Check className="size-4" />,
  error: <CircleAlert className="size-4" />,
};

/**
 * Consensus pipeline visualizer. GenLayer settlement (especially evaluate_claim,
 * which renders the web + runs an LLM under consensus) can take minutes; this
 * makes the long wait legible instead of a blind spinner.
 */
export function TxProgress({ state }: { state: TxState }) {
  if (!state.active && state.stage !== "error" && state.stage !== "finalized") return null;

  const isError = state.stage === "error";
  const currentIndex = ORDER.indexOf(state.stage);

  return (
    <div
      className="rounded-lg border border-border bg-muted/40 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {isError ? (
          <CircleAlert className="size-4 text-destructive" />
        ) : state.stage === "finalized" ? (
          <Check className="size-4 text-success" />
        ) : (
          <Loader2 className="size-4 animate-spin text-accent" />
        )}
        <p
          className={cn(
            "text-sm font-medium",
            isError ? "text-destructive" : "text-foreground"
          )}
        >
          {isError ? state.error ?? "Transaction failed" : state.message}
        </p>
      </div>

      {!isError ? (
        <ol className="mt-4 flex items-center gap-1">
          {ORDER.map((step, idx) => {
            const done = idx < currentIndex || state.stage === "finalized";
            const active = idx === currentIndex && state.stage !== "finalized";
            return (
              <li key={step} className="flex flex-1 items-center gap-1">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full border transition-colors",
                      done && "border-success/40 bg-success/15 text-success",
                      active && "border-accent/50 bg-accent/15 text-accent animate-pulse-ring",
                      !done && !active && "border-border bg-card text-muted-foreground"
                    )}
                  >
                    {done ? <Check className="size-4" /> : STEP_ICON[step]}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {STEP_LABEL[step]}
                  </span>
                </div>
                {idx < ORDER.length - 1 ? (
                  <span
                    className={cn(
                      "mb-4 h-0.5 flex-1 rounded-full transition-colors",
                      idx < currentIndex || state.stage === "finalized"
                        ? "bg-success/40"
                        : "bg-border"
                    )}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {state.hash ? (
        <a
          href={`https://genlayer-explorer.vercel.app/tx/${state.hash}`}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-block font-mono text-xs text-accent underline-offset-2 hover:underline"
        >
          tx {shortAddress(state.hash)}
        </a>
      ) : null}
    </div>
  );
}
