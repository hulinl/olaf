"use client";

import { InputHTMLAttributes, useState } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Password input s vestavěným „Zobrazit / Skrýt" toggle.
 *
 * Také propaguje `name` prop — bez něj Chrome nespolehlivě triggeruje
 * strong-password generator. `autoComplete="new-password"` (signup)
 * říká browseru, že smí nabídnout suggestion; `current-password`
 * (login) říká „vyplň uložené heslo".
 *
 * Sdílíme mezi /signup, /login, /reset-password aby jedno UI (a jeden
 * a11y toggle) fungovalo napříč všemi místy.
 */
export function PasswordInput({ className, ...rest }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...rest}
        type={visible ? "text" : "password"}
        className={[
          "h-11 w-full rounded-md border border-border bg-surface px-3 pr-16 text-sm",
          "placeholder:text-ink-300",
          "focus-ring",
          "transition-colors duration-150",
          className ?? "",
        ].join(" ")}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Skrýt heslo" : "Zobrazit heslo"}
        aria-pressed={visible}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-ink-500 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring"
        tabIndex={-1}
      >
        {visible ? "Skrýt" : "Zobrazit"}
      </button>
    </div>
  );
}
