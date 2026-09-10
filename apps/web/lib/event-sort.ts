/**
 * Sort helpery pro `EventSummary` listy napříč aplikací.
 *
 * V UI zobrazujeme akce ve dvou skupinách:
 * - **Nadcházející** — nejbližší akce první (dnes/zítra nahoře, akce
 *   za rok dole). ASC podle `starts_at`.
 * - **Minulé** — nejnověji proběhlé první (dnes/včera nahoře, staré
 *   dole). DESC podle `starts_at`.
 *
 * Backend list endpointy vracejí různé řazení (owner listy DESC,
 * `my_events` ASC), takže resortujeme na klientu, aby všechna místa
 * v aplikaci zobrazovala akce stejně. User request 2026-09-10:
 * „chci řadit od nejmladší po nejstarší, aby ta co proběhla dnes
 * byla první v minulých".
 *
 * Funkce **nikdy nemutují vstup** — vracejí novou array (`.slice()`
 * kopírujeme; JS `.sort` mutuje in-place).
 */

interface EventLike {
  starts_at: string;
}

function byStartsAtAsc(a: EventLike, b: EventLike): number {
  return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
}

function byStartsAtDesc(a: EventLike, b: EventLike): number {
  return new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime();
}

export function sortUpcoming<T extends EventLike>(events: T[]): T[] {
  return events.slice().sort(byStartsAtAsc);
}

export function sortPast<T extends EventLike>(events: T[]): T[] {
  return events.slice().sort(byStartsAtDesc);
}
