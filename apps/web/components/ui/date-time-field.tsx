"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { cs } from "date-fns/locale";

import "react-day-picker/style.css";

interface Props {
  /** "YYYY-MM-DDTHH:mm" — same shape as datetime-local. */
  value: string;
  onChange: (next: string) => void;
  id?: string;
  required?: boolean;
  placeholder?: string;
}

function parseValue(v: string): { date: Date | undefined; time: string } {
  if (!v) return { date: undefined, time: "" };
  const [d, t] = v.split("T");
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return { date: undefined, time: t ?? "" };
  return { date: new Date(y, m - 1, day), time: t ?? "" };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function combine(date: Date | undefined, time: string): string {
  if (!date) return "";
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return time ? `${d}T${time}` : `${d}T00:00`;
}

const DISPLAY_FMT = new Intl.DateTimeFormat("cs-CZ", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function DateTimeField({
  value,
  onChange,
  id,
  required,
  placeholder = "Vyber datum",
}: Props) {
  const reactId = useId();
  const fieldId = id ?? reactId;

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { date, time } = parseValue(value);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function pickDate(d: Date | undefined) {
    onChange(combine(d, time));
  }

  function pickTime(t: string) {
    onChange(combine(date, t));
  }

  const label = date ? DISPLAY_FMT.format(date) : placeholder;

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={fieldId}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={[
          "flex h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 text-sm focus-ring transition-colors",
          date ? "text-ink-900" : "text-ink-300",
        ].join(" ")}
      >
        <span className="flex items-center gap-2 truncate">
          <CalendarIcon />
          <span className="truncate">{label}</span>
          {date && time ? (
            <span className="text-ink-500">· {time}</span>
          ) : null}
        </span>
        <ChevronDownIcon open={open} />
      </button>

      {required && !value ? (
        <input
          type="text"
          required
          tabIndex={-1}
          aria-hidden="true"
          value=""
          onChange={() => {}}
          onFocus={() => triggerRef.current?.focus()}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      ) : null}

      {open && (
        <div
          role="dialog"
          aria-label="Vybrat datum a čas"
          className="absolute left-0 z-30 mt-2 origin-top-left rounded-md border border-border bg-surface shadow-lg"
        >
          <DayPicker
            mode="single"
            selected={date}
            onSelect={pickDate}
            locale={cs}
            weekStartsOn={1}
            showOutsideDays
            className="p-3"
          />
          <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-muted/40 px-3 py-2.5">
            <label
              htmlFor={`${fieldId}-time`}
              className="text-xs font-medium uppercase tracking-wide text-ink-500"
            >
              Čas
            </label>
            <input
              id={`${fieldId}-time`}
              type="time"
              step={300}
              value={time}
              onChange={(e) => pickTime(e.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-2 text-sm focus-ring"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
            >
              Hotovo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-ink-500"
    >
      <rect
        x="3"
        y="4.5"
        width="14"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M3 8 H17"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M7 3 V6 M13 3 V6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={[
        "shrink-0 text-ink-500 transition-transform",
        open ? "rotate-180" : "",
      ].join(" ")}
    >
      <path
        d="M5 8 L10 13 L15 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
