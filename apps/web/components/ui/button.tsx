import Link from "next/link";
import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

interface BaseProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-brand text-ink-inverse hover:bg-brand-hover active:bg-brand-active disabled:opacity-50",
  secondary:
    "bg-surface text-ink-900 border border-border-strong hover:bg-surface-muted disabled:opacity-50",
  ghost:
    "bg-transparent text-ink-900 hover:bg-surface-muted disabled:opacity-50",
  danger:
    "bg-danger text-white hover:opacity-90 disabled:opacity-50",
};

const SIZE: Record<Size, string> = {
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

function base(
  variant: Variant,
  size: Size,
  fullWidth: boolean,
  extra?: string,
) {
  return [
    "inline-flex items-center justify-center gap-2 rounded-md font-medium",
    "transition-colors duration-150 focus-ring",
    "disabled:cursor-not-allowed",
    VARIANT[variant],
    SIZE[size],
    fullWidth ? "w-full" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps>;

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  children,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={base(variant, size, fullWidth, className)}
    >
      {children}
    </button>
  );
}

interface LinkButtonProps extends BaseProps {
  href: string;
  children: ReactNode;
  className?: string;
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={base(variant, size, fullWidth, className)}
    >
      {children}
    </Link>
  );
}
