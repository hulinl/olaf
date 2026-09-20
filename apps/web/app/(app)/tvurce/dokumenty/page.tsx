import { ComingSoon } from "@/components/ui/coming-soon";

export default function AdminDokumentyPage() {
  return (
    <ComingSoon
      title="Dokumenty"
      body="Šablony pro waivery, GDPR souhlasy, gear listy a další papíry, které potřebuješ ke každé akci. Účastník nahrává své doklady (pojištění, smlouvu) přímo ke svojí registraci."
      bullets={[
        "Šablony znovupoužitelné napříč akcemi",
        "Účastníci nahrávají PDF / obrázky",
        "Přehled, kdo co dodal / nedodal",
      ]}
    />
  );
}
