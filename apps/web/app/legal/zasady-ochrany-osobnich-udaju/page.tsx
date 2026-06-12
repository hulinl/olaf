import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Zásady ochrany osobních údajů — olaf",
  description:
    "Jak platforma olaf zpracovává osobní údaje uživatelů, pořadatelů a účastníků akcí. V souladu s GDPR a zákonem č. 110/2019 Sb.",
  alternates: { canonical: "/legal/zasady-ochrany-osobnich-udaju" },
};

export default function PrivacyPolicyPage() {
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
          Zásady ochrany osobních údajů
        </h1>
        <p className="mt-3 text-sm text-ink-500">
          Účinnost od 12. 6. 2026. Verze 1.0.
        </p>

        <div className="prose-content mt-10 space-y-8 text-ink-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              1. Kdo je správce osobních údajů
            </h2>
            <p className="mt-3">
              Provozovatelem aplikace <strong>olaf</strong> (dostupné na{" "}
              <Link href="/" className="underline hover:text-ink-900">
                olaf.events
              </Link>
              ) a správcem osobních údajů ve smyslu nařízení (EU)
              2016/679 (GDPR) a zákona č. 110/2019 Sb. je{" "}
              <strong>BIfactory s.r.o.</strong>, IČO:{" "}
              <strong>01999923</strong>, se sídlem v České republice,
              zapsaná v obchodním rejstříku. Kontakt:{" "}
              <a
                href="mailto:hulin@bifactory.cz"
                className="underline hover:text-ink-900"
              >
                hulin@bifactory.cz
              </a>
              .
            </p>
            <p className="mt-3">
              <strong>Pověřenec pro ochranu osobních údajů (DPO):</strong>{" "}
              Vzhledem k povaze a rozsahu zpracování nejsme dle čl. 37
              GDPR povinni jmenovat DPO. Veškeré dotazy ohledně osobních
              údajů směřuj na výše uvedený e-mail správce — odpovídáme do
              30 dnů od doručení žádosti.
            </p>
            <p className="mt-3">
              olaf vystupuje jako jednotný správce pro veškeré osobní údaje
              zpracovávané v aplikaci — registrace uživatelů, profily,
              přihlášky na akce, komunikace. Pořadatelé akcí (vlastníci
              workspacu) získávají údaje účastníků pouze prostřednictvím
              olafu a podléhají těmto zásadám.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              2. Jaké údaje zpracováváme
            </h2>
            <p className="mt-3">
              <strong>Při registraci na akci:</strong> jméno, příjmení,
              e-mailová adresa, telefonní číslo (pokud pořadatel vyžaduje),
              odpovědi na dotazníkové sekce konkrétní akce (např. velikost
              trika, dieta, kondice, kontakt v nouzi, fotografický souhlas).
            </p>
            <p className="mt-3">
              <strong>Při založení účtu:</strong> e-mail, heslo (uložené
              jako jednosměrný hash), jméno, příjmení.
            </p>
            <p className="mt-3">
              <strong>Při užívání aplikace:</strong> přihlašovací cookies,
              technické logy (IP adresa, čas requestu), historie tvých
              registrací, platby (variabilní symbol, status), nahrané
              dokumenty (smlouvy, pojištění) — pokud relevantní pro
              konkrétní akci.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              3. Účel a právní základ zpracování
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong>Organizace akce a komunikace s účastníky</strong> —
                právní základ: plnění smlouvy mezi pořadatelem a účastníkem
                (čl. 6 odst. 1 písm. b GDPR).
              </li>
              <li>
                <strong>Zdravotní údaje</strong> (dieta, alergie, kondice,
                zdravotní poznámky) — zpracováváme pouze na základě
                explicitního souhlasu při registraci (čl. 9 odst. 2 písm.
                a GDPR). Souhlas můžeš kdykoli odvolat zrušením registrace.
              </li>
              <li>
                <strong>Provoz aplikace, prevence zneužití, bezpečnost</strong> —
                oprávněný zájem správce (čl. 6 odst. 1 písm. f GDPR).
              </li>
              <li>
                <strong>Plnění zákonných povinností</strong> (účetnictví u
                placených akcí) — čl. 6 odst. 1 písm. c GDPR.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              4. Komu údaje předáváme
            </h2>
            <p className="mt-3">
              Údaje předáváme následujícím zpracovatelům, kteří působí
              v rámci EU/EHP a podléhají GDPR:
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-6">
              <li>
                <strong>Microsoft Azure</strong> (Irsko/Nizozemsko) —
                hosting aplikace, databáze, blob storage pro nahrané
                soubory.
              </li>
              <li>
                <strong>Azure Communication Services</strong> — odesílání
                transakčních e-mailů (potvrzení registrace, zrušení).
              </li>
              <li>
                <strong>Pořadatel akce</strong> (vlastník konkrétního
                workspacu) — má přístup k údajům účastníků své akce v rámci
                aplikace. Nesmí je vyvádět ven nebo používat k jiným
                účelům.
              </li>
            </ul>
            <p className="mt-3">
              Žádné údaje nepředáváme do třetích zemí mimo EU/EHP a
              neprodáváme je třetím stranám pro marketingové účely.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              5. Jak dlouho údaje uchováváme
            </h2>
            <p className="mt-3">
              Registrační údaje na akci uchováváme po dobu nezbytně nutnou
              k jejímu uskutečnění a vypořádání případných nároků. Účetní
              doklady uchováváme po dobu stanovenou zákonem o účetnictví
              (typicky 10 let). Údaje účtu uchováváme po dobu, kdy účet
              existuje. Po zrušení účtu údaje anonymizujeme nebo smažeme,
              s výjimkou těch, které musíme držet kvůli zákonné povinnosti.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              6. Tvoje práva
            </h2>
            <p className="mt-3">Máš následující práva, která můžeš kdykoli uplatnit:</p>
            <ul className="mt-3 list-disc space-y-1 pl-6">
              <li>
                <strong>Přístup</strong> k tvým osobním údajům (čl. 15
                GDPR).
              </li>
              <li>
                <strong>Oprava</strong> nepřesných údajů (čl. 16 GDPR).
              </li>
              <li>
                <strong>Výmaz</strong> osobních údajů („právo být
                zapomenut", čl. 17 GDPR) — pokud nejsou potřebné k účelu
                zpracování nebo plnění zákonné povinnosti.
              </li>
              <li>
                <strong>Omezení zpracování</strong> (čl. 18 GDPR).
              </li>
              <li>
                <strong>Přenositelnost</strong> tvých údajů ve
                strojově-čitelné podobě (čl. 20 GDPR).
              </li>
              <li>
                <strong>Námitka proti zpracování</strong> založenému na
                oprávněném zájmu (čl. 21 GDPR).
              </li>
              <li>
                <strong>Odvolání souhlasu</strong> — kde je souhlas
                právním základem (např. zdravotní údaje).
              </li>
              <li>
                <strong>Stížnost u dozorového úřadu</strong> — Úřad pro
                ochranu osobních údajů, Pplk. Sochora 27, 170 00 Praha 7,{" "}
                <a
                  href="https://www.uoou.cz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-ink-900"
                >
                  uoou.cz
                </a>
                .
              </li>
            </ul>
            <p className="mt-3">
              Pro uplatnění práv nás kontaktuj na{" "}
              <a
                href="mailto:hulin@bifactory.cz"
                className="underline hover:text-ink-900"
              >
                hulin@bifactory.cz
              </a>
              . Odpovídáme do 30 dnů.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              7. Cookies a sledování
            </h2>
            <p className="mt-3">
              olaf používá pouze <strong>technicky nezbytné cookies</strong>{" "}
              (přihlašovací session, CSRF token, jazyk). Tyto cookies nejsou
              určeny pro marketingové sledování a nepřenášíme je třetím
              stranám. Nepoužíváme Google Analytics ani jiné third-party
              tracking pixely. Podrobný seznam cookies a jejich účel najdeš
              v{" "}
              <Link
                href="/legal/cookies"
                className="underline hover:text-ink-900"
              >
                Informacích o cookies →
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              8. Bezpečnost
            </h2>
            <p className="mt-3">
              Veškerá komunikace s aplikací probíhá přes šifrované spojení
              (HTTPS, TLS 1.2+). Hesla ukládáme jako kryptografické hashe
              (Argon2id). Databáze i nahrané soubory jsou uloženy v
              datacentrech Microsoft Azure v EU s certifikací ISO 27001.
              Přístup k produkčním datům má pouze omezený okruh
              autorizovaných osob.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-ink-900">
              9. Změny zásad
            </h2>
            <p className="mt-3">
              Aktuální verzi zásad ochrany osobních údajů publikujeme na
              této stránce. O podstatných změnách informujeme uživatele
              s aktivním účtem e-mailem alespoň 14 dní před účinností.
            </p>
          </section>

          <section className="rounded-md border border-border bg-surface-muted/40 p-5">
            <p className="text-sm text-ink-500">
              Toto je živý dokument. Pokud máš dotaz nebo námět,{" "}
              <a
                href="mailto:hulin@bifactory.cz"
                className="underline hover:text-ink-900"
              >
                napiš nám
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
