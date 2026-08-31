"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (input: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_META: Record<
  ToastTone,
  { icon: typeof Info; className: string; iconClass: string }
> = {
  success: {
    icon: CheckCircle2,
    className: "border-status-paid/25",
    iconClass: "text-status-paid",
  },
  error: {
    icon: AlertCircle,
    className: "border-status-failed/25",
    iconClass: "text-status-failed",
  },
  info: {
    icon: Info,
    className: "border-accent-400/25",
    iconClass: "text-accent-400",
  },
};

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Monotonic id source. Date.now() collides when two toasts fire in the same
  // millisecond, which is exactly what happens on a fast reject-then-retry.
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  // Clear every pending auto-dismiss on unmount. Without this, a toast raised
  // just before navigation leaves a timer that fires into an unmounted tree,
  // and the Map retains its entries.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((current) => {
        // Cap the stack so a repeated failure cannot bury the page.
        const next = [...current, { ...input, id }];
        return next.length > 3 ? next.slice(next.length - 3) : next;
      });
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
      );
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* aria-live so screen readers announce connection results, which are
          otherwise a purely visual state change. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col
                   items-center gap-2 p-4 sm:items-end sm:p-6"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => {
            const meta = TONE_META[item.tone];
            const Icon = meta.icon;
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3",
                  "rounded-xl px-4 py-3 shadow-lg",
                  meta.className
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.iconClass)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-100">{item.title}</p>
                  {item.description && (
                    <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-400">
                      {item.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="-mr-1 -mt-1 rounded-md p-1 text-slate-500 transition-colors
                             hover:bg-white/5 hover:text-slate-300"
                  aria-label="Dismiss notification"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
