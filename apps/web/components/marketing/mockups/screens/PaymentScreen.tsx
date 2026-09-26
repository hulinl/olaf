/**
 * Mobile QR payment screen — mockup toho, co účastník vidí po
 * potvrzené registraci: QR kód, částka, VS, IBAN, splatnost + „Mám
 * zaplaceno" tlačítko. Použije se v PhoneFrame pro „Platby" feature.
 *
 * QR kód je synthetic (12×12 grid dots), ne real generated QR — je to
 * jen vizuální stand-in, který v mockupu vypadá věrohodně na první
 * pohled, ale nesnaží se být sken-nutelný.
 */
export function PaymentScreen() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink-900">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-[9px] text-ink-500">←</span>
        <span className="text-[9px] font-semibold text-ink-900">Platba</span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col items-center overflow-hidden px-4 py-4">
        <p className="mockup-mono text-[6px] text-ink-500">
          SPRING CAMP BESKYDY
        </p>
        <p className="mt-1 text-[13px] font-semibold leading-none tracking-tight text-ink-900 tabular-nums">
          1 800 Kč
        </p>
        <p className="mt-1 text-[7px] text-ink-500">
          Splatnost do 15. dubna 2026
        </p>

        {/* QR kód — synthetic grid dots, vypadá věrohodně */}
        <div className="mt-3 rounded-sm border-2 border-ink-900 bg-canvas p-2">
          <QrGrid />
        </div>
        <p className="mockup-mono text-[6px] mt-1.5 text-ink-500">Naskenuj v bance</p>

        {/* Details */}
        <div className="mt-4 w-full space-y-1.5 rounded-sm border border-border bg-surface p-2">
          <DetailRow label="Účet" value="1234567890 / 0300" />
          <DetailRow label="VS" value="2600018" mono />
          <DetailRow label="Zpráva" value="Olaf Adv. — Spring Camp" />
        </div>

        {/* CTA */}
        <div className="mt-auto w-full pt-4">
          <div className="flex h-8 w-full items-center justify-center rounded-sm bg-brand text-[9px] font-semibold text-brand-ink">
            Mám zaplaceno
          </div>
          <p className="mt-1.5 text-center text-[6px] text-ink-500">
            Pořadatel spáruje během několika minut
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[7px]">
      <span className="text-ink-500">{label}</span>
      <span
        className={`font-medium text-ink-900 ${
          mono ? "font-mono tracking-tight" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Synthetic QR mock — 21×21 modules like real QR level L. Deterministic
 * pattern (finder squares in corners + noise-like inner cells) tak, aby
 * to na první pohled vypadalo jako reálný QR. Nemá být scannable.
 */
function QrGrid() {
  const size = 21;
  // Deterministic pseudo-random pattern podle (i*size + j) — kontrola
  // hustoty ~48% aby QR vypadal realisticky (real QR ~50%).
  const cells: boolean[][] = [];
  for (let i = 0; i < size; i++) {
    const row: boolean[] = [];
    for (let j = 0; j < size; j++) {
      // Finder pattern — top-left, top-right, bottom-left 7×7 blocks
      const inFinderTL = i < 7 && j < 7;
      const inFinderTR = i < 7 && j >= size - 7;
      const inFinderBL = i >= size - 7 && j < 7;
      if (inFinderTL || inFinderTR || inFinderBL) {
        // Outer ring + center dot
        const localI = inFinderBL ? i - (size - 7) : i;
        const localJ = inFinderTR ? j - (size - 7) : j;
        const isBorder =
          localI === 0 ||
          localI === 6 ||
          localJ === 0 ||
          localJ === 6;
        const isCenter =
          localI >= 2 && localI <= 4 && localJ >= 2 && localJ <= 4;
        row.push(isBorder || isCenter);
        continue;
      }
      // Deterministic noise pro data area
      const seed = (i * 137 + j * 349) % 100;
      row.push(seed < 48);
    }
    cells.push(row);
  }
  return (
    <div
      className="grid gap-0"
      style={{
        gridTemplateColumns: `repeat(${size}, 4px)`,
        gridTemplateRows: `repeat(${size}, 4px)`,
      }}
    >
      {cells.flat().map((filled, idx) => (
        <span
          key={idx}
          className={filled ? "bg-ink-900" : "bg-canvas"}
        />
      ))}
    </div>
  );
}
