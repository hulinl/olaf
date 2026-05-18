import { ComingSoon } from "@/components/ui/coming-soon";

export default function AdminClenovePage() {
  return (
    <ComingSoon
      title="Členové"
      body="Roster lidí v tvé komunitě — kdo se kdy přidal, na kolika akcích byl, čeho je členem. Včetně možnosti zvát nové členy hromadně přes emaily."
      bullets={[
        "Přehled napříč všemi akcemi komunity",
        "Tagy a segmenty (běžci, kolaři, instruktoři, …)",
        "Hromadné e-maily členům",
      ]}
    />
  );
}
