import { ComingSoon } from "@/components/ui/coming-soon";

export default function AdminPlatbyPage() {
  return (
    <ComingSoon
      title="Platby"
      body="QR platby přes SPAYD standard, automatické párování z bankovního výpisu (Fio API, KB), faktury přes iDoklad."
      bullets={[
        "Vygeneruje QR pro každou registraci",
        "Sleduje stav platby (čeká / přijata / refundovaná)",
        "Automaticky vystaví fakturu po spárování",
      ]}
    />
  );
}
