"use client";

import { useState } from "react";

import { type Workspace } from "@/lib/api";
import { SOCIAL_SERVICES } from "@/lib/social-services";

import { WorkspaceContactDialog } from "./workspace-contact-dialog";

interface Props {
  workspace: Workspace;
  className?: string;
  /** `on-dark` = bílá ikona + translucent border, pro overlay nad
   *  cover fotkou (public /<slug> hero). Default = světlá surface
   *  varianta pro canvas pozadí. */
  variant?: "default" | "on-dark";
}

/**
 * Řada značkových ikon pro `workspace.social_links` — viditelná na
 * public komunita stránce (`/[slug]/page.tsx`) a in-app workspace
 * profil stránce (`/(app)/workspaces/[slug]/page.tsx`). E-mail
 * neukazuje URL ale otevírá kontaktní formulář; jméno značky se ve
 * `social-services.tsx` whitelisteme (Facebook např. už není).
 */
export function WorkspaceSocialsRow({
  workspace,
  className,
  variant = "default",
}: Props) {
  const [contactOpen, setContactOpen] = useState(false);
  const links = workspace.social_links ?? {};
  const iconBtnClasses =
    variant === "on-dark"
      ? "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/10 text-ink-inverse backdrop-blur-sm transition-colors hover:border-white/70 hover:bg-white/20 focus-ring"
      : "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-ink-700 transition-colors hover:border-brand hover:bg-surface-muted hover:text-brand focus-ring";

  const items = SOCIAL_SERVICES.flatMap((service) => {
    if (service.isContactForm) {
      // Backend signalizuje, že komunita má vyplněný kontaktní email
      // přes `has_contact_form` — adresa sama v public response není.
      if (!workspace.has_contact_form && !links[service.key]) return [];
      return [{ service, href: null as string | null }];
    }
    const value = (links[service.key] || "").trim();
    if (!value) return [];
    return [{ service, href: value }];
  });

  if (items.length === 0) return null;

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
        {items.map(({ service, href }) => {
          const { Icon, label } = service;
          // Kompaktní icon-only pill — každou značku uživatel pozná
          // podle ikony (user request 2026-09-20: „nechme jen barevnou
          // ikonu, textový label neuvidíme"). Label zůstává jako
          // aria-label + title pro tooltip.
          if (service.isContactForm) {
            return (
              <button
                key={service.key}
                type="button"
                onClick={() => setContactOpen(true)}
                className={iconBtnClasses}
                aria-label="Napsat komunitě"
                title="Napsat komunitě"
              >
                <Icon size={16} />
              </button>
            );
          }
          if (!href) return null;
          return (
            <a
              key={service.key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={iconBtnClasses}
              aria-label={label}
              title={label}
            >
              <Icon size={16} />
            </a>
          );
        })}
      </div>
      <WorkspaceContactDialog
        open={contactOpen}
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        onClose={() => setContactOpen(false)}
      />
    </>
  );
}
