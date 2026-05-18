import { ComingSoon } from "@/components/ui/coming-soon";

export default function AdminSmlouvyPage() {
  return (
    <ComingSoon
      title="Smlouvy"
      body="Smlouvy s ubytováním, instruktory, sponzory — všechno na jednom místě, navázané na konkrétní akci nebo na celou komunitu."
      bullets={[
        "Verze a podpisy (DocuSign / Box Sign integrace)",
        "Připomenutí blížící se exspirace",
        "Plný history za komunitu",
      ]}
    />
  );
}
