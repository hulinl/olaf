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
  return <div className={`p-6 ${className}`}>{children}</div>;
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
