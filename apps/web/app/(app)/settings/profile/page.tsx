"use client";

import { Card, CardSection } from "@/components/ui/card";
import { useUser } from "@/lib/user-context";

export default function ProfileSettingsPage() {
  const user = useUser();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">Profile</h2>
          <p className="mt-1 text-sm text-ink-500">
            Profile editing lands in a follow-up. For now, here&apos;s the
            information on your account.
          </p>

          <dl className="mt-6 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            <Row label="Full name" value={user.full_name} />
            <Row label="Email" value={user.email} />
            <Row label="Display name" value={user.display_name || "—"} />
            <Row label="Phone" value={user.phone || "—"} />
            <Row
              label="Date of birth"
              value={
                user.dob ? new Date(user.dob).toLocaleDateString() : "—"
              }
            />
            <Row
              label="Fitness level"
              value={user.fitness_level || "—"}
            />
          </dl>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">
            Sport tags &amp; bio
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Tell other members what you&apos;re into. Editable once the profile
            form lands.
          </p>
          <dl className="mt-6 grid gap-x-8 gap-y-1">
            <Row
              label="Sport tags"
              value={
                user.sport_tags.length > 0 ? user.sport_tags.join(", ") : "—"
              }
            />
            <Row label="Bio" value={user.bio || "—"} />
          </dl>
        </CardSection>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-3 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="text-sm font-medium text-ink-900 break-words">
        {value}
      </dd>
    </div>
  );
}
