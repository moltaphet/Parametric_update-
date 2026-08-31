"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import {
  describeError,
  isUserRejection,
  type TxProgress,
  type TxStage,
} from "@/lib/transactions";
import { WalletError } from "@/lib/wallet";

export interface TxState {
  stage: TxStage;
  message: string;
  hash?: `0x${string}`;
  error?: string;
  /** True while the transaction is in flight; drives disabled/spinner states. */
  busy: boolean;
}

const IDLE: TxState = { stage: "idle", message: "", busy: false };

type Runner = (onStage: (progress: TxProgress) => void) => Promise<TxProgress>;

interface RunOptions {
  /** Toast title on success. Omit to stay silent. */
  successTitle?: string;
  successDescription?: string;
  /** Toast title on failure. Defaults to "Transaction failed". */
  errorTitle?: string;
}

/**
 * Drives one write transaction through the GenLayer consensus pipeline.
 *
 * Owns three things a component should not have to: the stage machine, toast
 * reporting, and the concurrency guard. Returns the receipt on success and
 * `null` on failure - it deliberately does not rethrow, because every caller
 * was writing the same try/catch to swallow an error the hook had already
 * surfaced as a toast.
 */
export function useTransaction() {
  const [state, setState] = useState<TxState>(IDLE);
  const { toast } = useToast();

  // Ref rather than state: a double click must be rejected synchronously,
  // before React has a chance to re-render with the new busy flag.
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  const run = useCallback(
    async (runner: Runner, options: RunOptions = {}): Promise<TxProgress | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;

      setState({ stage: "preparing", message: "Preparing transaction...", busy: true });

      try {
        const result = await runner((progress) => {
          if (!mounted.current) return;
          setState({
            stage: progress.stage,
            message: progress.message,
            hash: progress.hash,
            busy: progress.stage !== "finalized" && progress.stage !== "error",
          });
        });

        if (mounted.current) {
          setState({
            stage: "finalized",
            message: result.message,
            hash: result.hash,
            busy: false,
          });
        }

        if (options.successTitle) {
          toast({
            tone: "success",
            title: options.successTitle,
            description: options.successDescription,
          });
        }
        return result;
      } catch (error) {
        // A wallet that is not connected is a precondition failure, not a
        // transaction failure: report it as guidance instead of an error.
        if (error instanceof WalletError) {
          if (mounted.current) setState(IDLE);
          toast({
            tone: "info",
            title: "Connect a wallet first",
            description: error.message,
          });
          return null;
        }

        const description = describeError(error);

        if (mounted.current) {
          setState((previous) => ({
            stage: "error",
            message: "",
            hash: previous.hash,
            error: description,
            busy: false,
          }));
        }

        // A rejected signature is normal user behavior, not a fault.
        toast({
          tone: isUserRejection(error) ? "info" : "error",
          title: isUserRejection(error)
            ? "Transaction cancelled"
            : options.errorTitle ?? "Transaction failed",
          description: isUserRejection(error) ? undefined : description,
        });
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [toast]
  );

  return { state, run, reset, busy: state.busy };
}
