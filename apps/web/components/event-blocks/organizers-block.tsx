import { Avatar } from "@/components/ui/avatar";
import { SectionHead } from "@/components/ui/section-head";
import type {
  BlockTone,
  OrganizerLookupEntry,
  OrganizersBlockPayload,
} from "@/lib/event-blocks";

interface Props {
  payload: OrganizersBlockPayload;
  /** Side-lookup z `event.organizers_by_user_id` — server-side join na
   *  User pro každý user_id v payload-u. Renderer si vybere jen vybrané
   *  IDs a v jejich pořadí. Pokud user mezitím zmizel (workspace ho
   *  smazal), položka se tiše propustí. */
  lookup?: Record<string, OrganizerLookupEntry>;
  tone?: BlockTone;
}

export function OrganizersBlock({ payload, lookup, tone = "canvas" }: Props) {
  const orderedUsers = (payload.user_ids ?? [])
    .map((id) => lookup?.[String(id)])
    .filter((u): u is OrganizerLookupEntry => Boolean(u));

  if (orderedUsers.length === 0) {
    return null;
  }

  const dark = tone === "ink";

  return (
    <section className={dark ? "bg-ink-900" : "bg-canvas"}>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
        {(payload.eyebrow || payload.title) && (
          <SectionHead
            eyebrow={payload.eyebrow}
            title={payload.title ?? ""}
            tone={dark ? "dark" : "light"}
          />
        )}
        {payload.intro && (
          <p
            className={[
              "mt-4 max-w-2xl",
              dark ? "text-white/80" : "text-ink-700",
            ].join(" ")}
            style={{ fontSize: 16, lineHeight: 1.6 }}
          >
            {payload.intro}
          </p>
        )}
        <ul
          className={[
            "mt-8 grid gap-6",
            orderedUsers.length === 1
              ? "max-w-md sm:grid-cols-1"
              : "sm:grid-cols-2 lg:grid-cols-3",
          ].join(" ")}
        >
          {orderedUsers.map((u) => (
            <li
              key={u.id}
              className={[
                "flex flex-col items-start gap-3 rounded-2xl p-5",
                dark
                  ? "border border-white/10 bg-white/5"
                  : "border border-border bg-surface",
              ].join(" ")}
            >
              {u.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.avatar_url}
                  alt=""
                  className="h-20 w-20 rounded-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <Avatar
                  firstName={u.first_name}
                  lastName={u.last_name}
                  size={80}
                />
              )}
              <div>
                <p
                  className={[
                    "text-base font-semibold",
                    dark ? "text-white" : "text-ink-900",
                  ].join(" ")}
                >
                  {u.display_name || u.full_name}
                </p>
                {u.bio && (
                  <p
                    className={[
                      "mt-2 whitespace-pre-line",
                      dark ? "text-white/75" : "text-ink-600",
                    ].join(" ")}
                    style={{ fontSize: 14, lineHeight: 1.6 }}
                  >
                    {u.bio}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
