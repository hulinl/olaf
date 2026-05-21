import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={[
        "rounded-lg border border-border bg-surface shadow-sm",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

interface CardSectionProps {
  children: ReactNode;
  className?: string;
}

export function CardSection({ children, className = "" }: CardSectionProps) {
  // Default to slightly tighter padding on mobile. 24 px all around
  // ate ~48 px of a 360 px viewport, which forced item-row titles to
  // wrap into 4 lines. 16 px on phone / 24 px on sm+ keeps cards
  // breathing without crushing content.
  return <div className={`p-4 sm:p-6 ${className}`}>{children}</div>;
}

interface AlertProps {
  variant?: "danger" | "success" | "info";
  children: ReactNode;
}

export function Alert({ variant = "danger", children }: AlertProps) {
  const styles: Record<NonNullable<AlertProps["variant"]>, string> = {
    danger: "bg-danger-soft text-danger border-danger/30",
    success: "bg-surface-muted text-success border-success/30",
    info: "bg-brand-soft text-brand-active border-brand/30",
  };
  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={[
        "rounded-md border px-3 py-2 text-sm",
        styles[variant],
      ].join(" ")}
    >
      {children}
    </div>
  );
}
