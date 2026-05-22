"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveal on scroll — wraps children in a div that's invisible until
 * it enters the viewport, then fades + rises into place. One-shot
 * (doesn't replay on scroll-out → scroll-back-in).
 *
 * Plain CSS class on a controlled boolean, no animation library —
 * keeps the bundle small and respects prefers-reduced-motion via the
 * global stylesheet rules.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  /** ms delay before fade-up kicks in once the element is visible. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) {
      // Old browser fallback — just show immediately.
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={[
        "transition-all duration-700 ease-out",
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-6 opacity-0",
        className,
      ].join(" ")}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
