"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { Button } from "@/components/ui/button";

/**
 * Native `confirm()` má v praxi tři otravné problémy:
 *
 *   1. Občas chce double-click na "OK" (focus → activate), uživatel
 *      hlásí to jako "tlačítko nereaguje".
 *   2. Vizuálně se neslučuje se zbytkem app; styly system-default.
 *   3. Nepouští se na různě nastavených prohlížečích konzistentně
 *      (blokované, redirekty, atp.).
 *
 * `useConfirm()` vrací async funkci, která render-uje vlastní dialog
 * a vyřeší Promise<boolean> na Ano/Ne kliknutí (nebo ESC/click-outside
 * = ne). Pattern:
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: "Odebrat člena?",
 *     description: "RSVPs zůstanou, e-mail nepřijde.",
 *     confirmLabel: "Odebrat",
 *     variant: "danger",
 *   });
 *   if (!ok) return;
 *
 * Provider mounted v root admin layout. Dialog renderuje JEDEN dialog
 * najednou (single-slot) — fronta nemá smysl, akce blokuje volajícího.
 */

export interface ConfirmOptions {
  title: string;
  /** Volitelný popis pod titulem. Multi-paragraph: '\n\n' splituje. */
  description?: string;
  /** Default "Potvrdit". */
  confirmLabel?: string;
  /** Default "Zrušit". */
  cancelLabel?: string;
  /** "primary" = brand; "danger" = červené tlačítko. Default "primary". */
  variant?: "primary" | "danger";
}

type Resolver = (ok: boolean) => void;

interface InternalState extends ConfirmOptions {
  resolver: Resolver;
}

const ConfirmContext = createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InternalState | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ ...opts, resolver: resolve });
      }),
    [],
  );

  function resolve(ok: boolean) {
    if (state) {
      state.resolver(ok);
      setState(null);
    }
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmDialog
          title={state.title}
          description={state.description}
          confirmLabel={state.confirmLabel ?? "Potvrdit"}
          cancelLabel={state.cancelLabel ?? "Zrušit"}
          variant={state.variant ?? "primary"}
          onConfirm={() => resolve(true)}
          onCancel={() => resolve(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider />.");
  }
  return ctx;
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant,
  onConfirm,
  onCancel,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Auto-focus na potvrzovací tlačítko po otevření — `autoFocus`
  // prop dole. Enter potvrdí, ESC zruší (handler níže).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const paragraphs = description
    ? description.split(/\n\n+/).filter(Boolean)
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/50 p-4"
      onClick={onCancel}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-ink-900"
        >
          {title}
        </h2>
        {paragraphs.length > 0 && (
          <div className="flex flex-col gap-2 text-sm text-ink-700">
            {paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "danger" ? "danger" : "primary"}
            size="md"
            autoFocus
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
