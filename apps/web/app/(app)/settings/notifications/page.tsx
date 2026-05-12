"use client";

import { Card, CardSection } from "@/components/ui/card";

const CATEGORIES: { title: string; items: string[] }[] = [
  {
    title: "Account",
    items: [
      "Email verification, password reset",
      "Granted or revoked Event Admin role",
    ],
  },
  {
    title: "Communities",
    items: [
      "Community invitation",
      "Membership approved or declined",
      "New event in a community you belong to",
    ],
  },
  {
    title: "Events",
    items: [
      "RSVP confirmation",
      "RSVP reminder 24 h before event",
      "Event updated (date, location)",
      "Event cancelled",
      "Promoted from waitlist to confirmed",
      "Document pending acknowledgement or upload",
    ],
  },
];

export default function NotificationsSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">Notifications</h2>
          <p className="mt-1 text-sm text-ink-500">
            Choose how olaf reaches you. The matrix lands with Slice 8 — until
            then, all transactional emails (verification, password reset, RSVP
            confirmations) are sent by default.
          </p>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h3 className="text-base font-semibold text-ink-900">
            What you&apos;ll be able to toggle
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            Per-row email and (eventually) push toggles, grouped by purpose.
          </p>
          <div className="mt-6 flex flex-col gap-6">
            {CATEGORIES.map((cat) => (
              <div key={cat.title}>
                <h4 className="text-sm font-semibold text-ink-700">
                  {cat.title}
                </h4>
                <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink-500">
                  {cat.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-border-strong" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardSection>
      </Card>
    </div>
  );
}
