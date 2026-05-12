"use client";

import { Card, CardSection } from "@/components/ui/card";

export default function AccountSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">Account</h2>
          <p className="mt-1 text-sm text-ink-500">
            Password, sessions, and account deletion. Editing controls land
            once the profile-write endpoints ship.
          </p>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h3 className="text-base font-semibold text-ink-900">
            Change password
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            Set a new password while logged in. Coming with the profile-write
            endpoint.
          </p>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h3 className="text-base font-semibold text-ink-900">
            Active sessions
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            See where you&apos;re signed in. Coming with the sessions slice.
          </p>
        </CardSection>
      </Card>

      <Card className="border-danger/30">
        <CardSection>
          <h3 className="text-base font-semibold text-danger">
            Delete account
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            Permanently delete your olaf account. Lands with Slice 12
            (account management + GDPR). Acknowledgement records will be
            anonymised, not deleted, per the privacy policy.
          </p>
        </CardSection>
      </Card>
    </div>
  );
}
