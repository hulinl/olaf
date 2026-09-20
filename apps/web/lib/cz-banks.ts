/**
 * Registr českých bank podle číselníku ČNB — 4-místný kód banky
 * → obchodní název. Používá se k auto-doplnění pole „Název banky"
 * v nastavení plateb komunity: user zadá IBAN, my z něj vytáhneme
 * kód (chars 4–8 v CZ IBAN) a přiřadíme jméno.
 *
 * Zdroj: https://www.cnb.cz/cs/platebni-styk/ucty-kody-bank/ — seznam
 * je stabilní, změny jsou vzácné (fúze, nové licence). Nezachycujeme
 * historické záznamy (např. GE Money → MONETA), používáme aktuální
 * názvy platné k 2026-09.
 */
export const CZ_BANKS: Record<string, string> = {
  "0100": "Komerční banka",
  "0300": "ČSOB",
  "0600": "MONETA Money Bank",
  "0710": "Česká národní banka",
  "0800": "Česká spořitelna",
  "2010": "Fio banka",
  "2020": "MUFG Bank (Europe)",
  "2060": "Citfin",
  "2070": "Trinity Bank",
  "2100": "Hypoteční banka",
  "2200": "Peněžní dům",
  "2220": "Artesa",
  "2250": "Banka CREDITAS",
  "2260": "NEY spořitelní družstvo",
  "2275": "Podnikatelská družstevní záložna",
  "2600": "Citibank",
  "2700": "UniCredit Bank",
  "3030": "Air Bank",
  "3050": "BNP Paribas Personal Finance",
  "3060": "PKO BP",
  "3500": "ING Bank",
  "4000": "Max banka",
  "4300": "Národní rozvojová banka",
  "5500": "Raiffeisenbank",
  "5800": "J&T Banka",
  "6000": "PPF banka",
  "6100": "Equa bank (Raiffeisenbank)",
  "6200": "Commerzbank",
  "6210": "mBank",
  "6300": "BNP Paribas",
  "6363": "Partners Banka",
  "6700": "Všeobecná úverová banka",
  "6800": "Sberbank CZ (v likvidaci)",
  "7910": "Deutsche Bank",
  "7940": "Waldviertler Sparkasse Bank",
  "7950": "Raiffeisen stavební spořitelna",
  "7960": "ČSOB Stavební spořitelna",
  "7970": "Wüstenrot – stavební spořitelna",
  "7990": "Modrá pyramida stavební spořitelna",
  "8040": "Oberbank AG",
  "8060": "Stavební spořitelna České spořitelny",
  "8090": "Česká exportní banka",
  "8150": "HSBC Bank",
  "8199": "MONETA Stavební Spořitelna",
  "8250": "Bank of China",
};

/**
 * Vytáhne 4-místný kód banky z CZ IBAN. Vrací `null`, když IBAN není
 * český formát nebo má špatnou délku. Vstup smí obsahovat mezery.
 *
 * CZ IBAN struktura: `CZkk BBBB SSSS SSCC CCCC CCCC` — bank code jsou
 * znaky 4–8 v compact tvaru (0-indexed).
 */
export function extractCzBankCode(iban: string): string | null {
  const stripped = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^CZ\d{2}\d{4}/.test(stripped)) return null;
  return stripped.slice(4, 8);
}

/**
 * Podle IBAN najde české jméno banky, nebo `null`. Používej pro auto-
 * doplnění pole „Název banky" — když user přepíše návrh ručně, zavolání
 * `lookupCzBankName` už tam nesahej.
 */
export function lookupCzBankName(iban: string): string | null {
  const code = extractCzBankCode(iban);
  if (!code) return null;
  return CZ_BANKS[code] ?? null;
}
