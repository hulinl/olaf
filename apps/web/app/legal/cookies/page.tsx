import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Informace o cookies — olaf",
  description:
    "Které cookies aplikace olaf používá, k čemu slouží a jak dlouho je uchováváme. V souladu s § 89 odst. 3 zákona č. 127/2005 Sb. a GDPR.",
  alternates: { canonical: "/legal/cookies" },
};

interface CookieRow {
  name: string;
  purpose: string;
  duration: string;
  type: "Nezbytná" | "Funkční";
}

const cookies: CookieRow[] = [
  {
    name: "sessionid",
    purpose:
      "Drží přihlášení uživatele po dobu otevřené relace v prohlížeči. Bez ní by ses musel přihlašovat při každém kliknutí.",
    duration: "Do odhlášení nebo 14 dnů neaktivity",
    type: "Nezbytná",
  },
  {
    name: "csrftoken",
    purpose:
      "Chrání před útokem CSRF (Cross-Site Request Forgery). Bez ní nelze odeslat formulář v aplikaci.",
    duration: "1 rok",
    type: "Nezbytná",
  },
  {
    name: "ARRAffinity / ARRAffinitySameSite",
    purpose:
      "Technická cookie Azure Static Web Apps (load balancer). Drží tě připojeného ke stejnému serveru během jedné relace.",
    duration: "Do zavření prohlížeče",
    type: "Nezbytná",
  },
];

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-canvas">
      <header className="border-b border-border bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-ink-900 transition-opacity hover:opacity-80"
            aria-label="olaf"
          >
            <Logo size={26} />
          </Link>
          <Link
            href="/"
            className="text-sm text-ink-500 hover:text-ink-900"
          >
            Zpět ↗
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500">
          Právní informace
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Informace o cookies
        </h1>
        <p className="mt-3 text-sm text-ink-500">
          Účinnost od 12. 6. 2026. Verze 1.0.
        </p>

        <div className="prose-content mt-10 space-y-8 text-ink-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              Stručně
            </h2>
            <p className="mt-3">
              Aplikace <strong>olaf</strong> používá <strong>výhradně
              technicky nezbytné cookies</strong>, které potřebuje
              k tomu, abys mohl/a být přihlášen/a a bezpečně odesílat
              formuláře. Nepoužíváme cookies pro marketingové sledování,
              Google Analytics, ani jiné analytické nebo reklamní
              nástroje třetích stran.
            </p>
            <p className="mt-3">
              Podle § 89 odst. 3 zákona č. 127/2005 Sb. nepotřebujeme
              pro nezbytné cookies tvůj souhlas. Pokud bys nezbytné
              cookies v prohlížeči blokoval/a, aplikace přestane
              fungovat (nebudeš se moct přihlásit, formuláře
              nepůjdou odeslat).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              Seznam cookies
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                    <th className="py-2 pr-3">Název</th>
                    <th className="py-2 px-3">Účel</th>
                    <th className="py-2 px-3">Doba</th>
                    <th className="py-2 pl-3">Typ</th>
                  </tr>
                </thead>
                <tbody>
                  {cookies.map((c) => (
                    <tr key={c.name} className="border-b border-border align-top">
                      <td className="py-3 pr-3 font-mono text-xs text-ink-900">
                        {c.name}
                      </td>
                      <td className="py-3 px-3 text-ink-700">{c.purpose}</td>
                      <td className="py-3 px-3 text-ink-700">{c.duration}</td>
                      <td className="py-3 pl-3">
                        <span className="inline-flex rounded bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                          {c.type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              Cookies třetích stran
            </h2>
            <p className="mt-3">
              olaf <strong>nepoužívá</strong> cookies ani tracking pixely
              třetích stran (Google Analytics, Meta Pixel, Hotjar,
              Mixpanel apod.). Jediné externí domény, na které prohlížeč
              odesílá data:
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-6">
              <li>
                <strong>api.olaf.events</strong> — naše vlastní API,
                stejný správce dat.
              </li>
              <li>
                <strong>{"<účet>"}.blob.core.windows.net</strong> —
                Azure Blob Storage pro fotografie a dokumenty. Nejsou
                cookies, jen stahování souborů.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              Jak smazat / blokovat cookies
            </h2>
            <p className="mt-3">
              Cookies můžeš kdykoli smazat v nastavení svého
              prohlížeče. Návody:
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-6">
              <li>
                <a
                  href="https://support.google.com/chrome/answer/95647"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-ink-900"
                >
                  Google Chrome
                </a>
              </li>
              <li>
                <a
                  href="https://support.mozilla.org/cs/kb/povoleni-zakazani-cookies"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-ink-900"
                >
                  Mozilla Firefox
                </a>
              </li>
              <li>
                <a
                  href="https://support.apple.com/cs-cz/guide/safari/sfri11471/mac"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-ink-900"
                >
                  Safari
                </a>
              </li>
              <li>
                <a
                  href="https://support.microsoft.com/cs-cz/microsoft-edge/odstran%C4%9Bn%C3%AD-soubor%C5%AF-cookie-v-prohl%C3%AD%C5%BEe%C4%8Di-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-ink-900"
                >
                  Microsoft Edge
                </a>
              </li>
            </ul>
            <p className="mt-3 text-sm text-ink-500">
              Pozn.: blokování nezbytných cookies aplikaci znemožní fungovat.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              Související dokumenty
            </h2>
            <p className="mt-3">
              <Link
                href="/legal/zasady-ochrany-osobnich-udaju"
                className="underline hover:text-ink-900"
              >
                Zásady ochrany osobních údajů →
              </Link>{" "}
              — celkové informace o zpracování osobních údajů, právní
              základy, tvoje práva.
            </p>
          </section>

          <section className="rounded-md border border-border bg-surface-muted/40 p-5">
            <p className="text-sm text-ink-500">
              Otázky?{" "}
              <a
                href="mailto:hulin@bifactory.cz"
                className="underline hover:text-ink-900"
              >
                hulin@bifactory.cz
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
