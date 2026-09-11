"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { ApiError, type UserPublicProfile, auth } from "@/lib/api";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Public user profile — `/u/<id>`. Zobrazuje co user zveřejnil přes
 * `profile_show_*` toggles v Nastavení. Když je viewer organizátor
 * akce s target userem, backend vrátí kompletní data (viz
 * UserPublicProfileSerializer.organizer_bypass) a UI ukáže badge, ať
 * je jasné proč tam vidí kontakt.
 *
 * Cílem je klikatelný odkaz odkudkoli v aplikaci — avatar v discussion
 * feedu / organizers block / roster / community members. User si zjistí
 * kdo za jménem stojí bez tápání.
 */
export default function PublicProfilePage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    auth
      .userProfile(Number.parseInt(id, 10))
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=/u/${id}`);
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (notFound) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-ink-900">
          Uživatel neexistuje
        </h1>
        <p className="mt-2 text-ink-500">
          Možná byl smazán nebo tady nikdy nebyl.
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <Alert variant="danger">{error}</Alert>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }

  const displayName =
    profile.display_name?.trim() || profile.full_name?.trim() || "Bez jména";
  const hasAddress =
    !!profile.address_street ||
    !!profile.address_city ||
    !!profile.address_zip;

  return (
    <div className="min-h-screen bg-canvas text-ink-900">
      {/* Minimální top nav — page je AllowAny, může sem přijít
          anonymous user z externího webu (guides link z
          olafadventures.cz atd.). Nemá mít v aplikaci navigation
          state, ale musí mít cestu zpět na home / login. */}
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-ink-900 transition-opacity hover:opacity-80"
            aria-label="olaf"
          >
            <Logo size={26} />
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-ink-700 hover:text-brand"
          >
            Přihlásit
          </Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-12">
        <Breadcrumbs
          items={[{ label: "Lidé" }, { label: displayName }]}
        />

        {profile.organizer_bypass && (
          <div className="mt-4 rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-ink-700">
            <strong className="text-brand">Vidíš jako pořadatel:</strong>{" "}
            uživatel je přihlášen na tvoji akci, takže tu vidíš i pole,
            která má schované.
          </div>
        )}

        <Card className="mt-6">
          <CardSection>
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Avatar
                firstName={profile.first_name}
                lastName={profile.last_name}
                avatarUrl={profile.avatar_url}
                focalX={profile.avatar_focal_x}
                focalY={profile.avatar_focal_y}
                zoom={profile.avatar_zoom}
                size={96}
              />
              <div className="min-w-0 flex-1">
                <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
                  {displayName}
                </h1>
                {profile.display_name && profile.full_name && (
                  <p className="mt-0.5 text-sm text-ink-500">
                    {profile.full_name}
                  </p>
                )}
                {profile.bio && (
                  <p className="mt-3 whitespace-pre-wrap text-ink-700">
                    {profile.bio}
                  </p>
                )}
              </div>
            </div>
          </CardSection>
        </Card>

        {(profile.email || profile.phone || hasAddress) && (
          <Card className="mt-4">
            <CardSection>
              <h2 className="text-base font-semibold text-ink-900">
                Kontakt
              </h2>
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {profile.email && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink-500">
                      E-mail
                    </dt>
                    <dd className="mt-0.5 text-sm">
                      <a
                        href={`mailto:${profile.email}`}
                        className="text-ink-900 hover:text-brand"
                      >
                        {profile.email}
                      </a>
                    </dd>
                  </div>
                )}
                {profile.phone && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink-500">
                      Telefon
                    </dt>
                    <dd className="mt-0.5 text-sm">
                      <a
                        href={`tel:${profile.phone.replace(/\s+/g, "")}`}
                        className="text-ink-900 hover:text-brand"
                      >
                        {profile.phone}
                      </a>
                    </dd>
                  </div>
                )}
                {hasAddress && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-ink-500">
                      Adresa
                    </dt>
                    <dd className="mt-0.5 text-sm text-ink-900">
                      {[
                        profile.address_street,
                        [profile.address_zip, profile.address_city]
                          .filter(Boolean)
                          .join(" "),
                        profile.address_country,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </dd>
                  </div>
                )}
              </dl>
            </CardSection>
          </Card>
        )}

        {!profile.email &&
          !profile.phone &&
          !hasAddress &&
          !profile.bio && (
            <p className="mt-6 rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-4 text-sm text-ink-500">
              Tento uživatel nezveřejnil žádné další údaje. Můžeš ho
              kontaktovat jinou cestou — třeba zprávou v komunitě.
            </p>
          )}

        <p className="mt-6 text-xs text-ink-500">
          <Link href="/settings/profile" className="hover:text-ink-900">
            → Nastavit vlastní veřejný profil
          </Link>
        </p>
        </section>
      </main>
    </div>
  );
}
