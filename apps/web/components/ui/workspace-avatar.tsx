import { assetUrl, type Workspace } from "@/lib/api";

type Size = "xs" | "sm" | "md" | "lg";

interface Props {
  workspace: Pick<
    Workspace,
    "name" | "logo_url" | "accent_color" | "logo_transparent"
  >;
  size?: Size;
  className?: string;
}

/**
 * Kompaktní workspace avatar pro seznamy, dropdowny a karty.
 *
 * Tři rendering módy podle uploadu:
 * - **transparent logo** (`logo_transparent=true`) — jen `<img>` s
 *   drop-shadow, žádný background/border container. Logo splyne s
 *   podkladem.
 * - **framed logo** (default když má `logo_url`) — bílý rounded
 *   container s borderem funguje jako mask pro plné (JPEG) loga.
 * - **iniciála** — první písmeno jména na `accent_color` pozadí
 *   (default neutrální surface-strong).
 *
 * Hero varianta na public landing (`/[slug]/page.tsx`) zůstává
 * inline — potřebuje specifický 4px white border pro overlay nad
 * cover fotkou a jinou logiku responsive velikosti. Tato komponenta
 * je pro světlé pozadí (canvas / surface) v aplikaci.
 */
export function WorkspaceAvatar({
  workspace,
  size = "md",
  className = "",
}: Props) {
  const logo = assetUrl(workspace.logo_url);
  const sizeClasses = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-9 w-9 text-sm",
    md: "h-12 w-12 text-base",
    lg: "h-14 w-14 text-lg",
  }[size];
  const rounded = size === "xs" || size === "sm" ? "rounded-md" : "rounded-lg";

  // Transparent logo: bez containeru, jen image s drop-shadow ať se
  // ztrátě pozadí nesplyne s hostitelským surface (tenký ambient stín
  // odděluje logo od bílé karty).
  if (logo && workspace.logo_transparent) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center ${sizeClasses} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt={`${workspace.name} logo`}
          className="h-full w-full object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]"
        />
      </div>
    );
  }

  const bgStyle =
    workspace.accent_color && !logo
      ? { backgroundColor: workspace.accent_color }
      : undefined;
  const framedBg = logo ? "bg-surface" : "bg-surface-strong";
  const borderClass = logo ? "border border-border" : "";

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden ${rounded} ${borderClass} ${framedBg} ${sizeClasses} ${className}`}
      style={bgStyle}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={`${workspace.name} logo`}
          className="h-full w-full object-contain"
        />
      ) : (
        <span className="font-semibold text-ink-inverse">
          {workspace.name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
