import { CSSProperties } from "react";

interface LogoProps {
  className?: string;
  size?: number;
  /** Show the wordmark beside the mark. Default true. */
  wordmark?: boolean;
  style?: CSSProperties;
}

/**
 * OLAF V0 mark — a topographic "O" with a peak inside, suggesting
 * routes and ascents. Placeholder identity until a brand pass lands;
 * swap this single file when the proper logo arrives.
 */
export function Logo({
  className = "",
  size = 28,
  wordmark = true,
  style,
}: LogoProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      style={style}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="16"
          cy="16"
          r="13.25"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path
          d="M7.5 21.5L12.5 15L15.5 18.5L20 11.5L25 21.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {wordmark && (
        <span
          className="font-semibold tracking-tight"
          style={{ fontSize: size * 0.72, lineHeight: 1 }}
        >
          olaf
        </span>
      )}
    </span>
  );
}
