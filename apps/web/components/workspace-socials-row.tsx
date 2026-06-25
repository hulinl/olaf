"use client";

import { useState } from "react";

import { type Workspace } from "@/lib/api";
import { SOCIAL_SERVICES } from "@/lib/social-services";

import { WorkspaceContactDialog } from "./workspace-contact-dialog";

interface Props {
  workspace: Workspace;
  className?: string;
}

/**
 * Řada značkových ikon pro `workspace.social_links` — viditelná na
 * public komunita stránce (`/[slug]/page.tsx`) a in-app workspace
 * profil stránce (`/(app)/workspaces/[slug]/page.tsx`). E-mail
 * neukazuje URL ale otevírá kontaktní formulář; jméno značky se ve
 * `social-services.tsx` whitelisteme (Facebook např. už není).
 */
export function WorkspaceSocialsRow({ workspace, className }: Props) {
  const [contactOpen, setContactOpen] = useState(false);
  const links = workspace.social_links ?? {};

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
      <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
        {items.map(({ service, href }) => {
          const { Icon, label } = service;
          const baseClasses =
            "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring";
          if (service.isContactForm) {
            return (
              <button
                key={service.key}
                type="button"
                onClick={() => setContactOpen(true)}
                className={baseClasses}
                aria-label="Napsat komunitě"
              >
                <Icon size={16} />
                <span>Napsat komunitě</span>
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
              className={baseClasses}
              aria-label={label}
            >
              <Icon size={16} />
              <span>{label}</span>
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
