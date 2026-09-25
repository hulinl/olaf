/**
 * Replica of nástěnka feed — topic card s avatarem, tělo, komentáře
 * preview, composer. Použije se v PhoneFrame pro „Nástěnka" feature
 * sekci.
 */
export function FeedTopicScreen() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-semibold text-ink-900">Nástěnka</span>
          <span className="text-[7px] text-ink-500">· Spring Camp</span>
        </div>
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-900 text-[7px] font-semibold text-canvas">
          O
        </span>
      </div>

      {/* Composer */}
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-muted px-2 py-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-900 text-[6px] font-semibold text-canvas">
            O
          </span>
          <span className="text-[7px] text-ink-500">Co se chystá? Napiš členům…</span>
        </div>
      </div>

      {/* Feed — 2 topicy */}
      <div className="flex-1 overflow-hidden">
        <TopicCard
          initials="MN"
          name="Marta Nová"
          age="před 12 min"
          body="Kdo bere karimatky navíc? Vezmu si dvě, můžu půjčit."
          likes={3}
          comments={5}
          hasAmberDot
          firstComment={{
            initials: "JV",
            name: "Jan Veselý",
            body: "Já beru dvě, můžeme dopočítat na místě.",
          }}
        />
        <TopicCard
          initials="LK"
          name="Lucie Kadlecová"
          age="včera"
          body="Update programu — noční přechod začne v 21:30 z Bumbálky. Sraz podle mapy."
          likes={8}
          comments={12}
          isPinned
        />
      </div>
    </div>
  );
}

function TopicCard({
  initials,
  name,
  age,
  body,
  likes,
  comments,
  isPinned,
  hasAmberDot,
  firstComment,
}: {
  initials: string;
  name: string;
  age: string;
  body: string;
  likes: number;
  comments: number;
  isPinned?: boolean;
  hasAmberDot?: boolean;
  firstComment?: { initials: string; name: string; body: string };
}) {
  return (
    <article className="border-b border-border px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-[8px] font-semibold text-canvas">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[9px] font-semibold text-ink-900">{name}</p>
            {hasAmberDot && (
              <span className="inline-block h-1 w-1 rounded-full bg-brand" />
            )}
            {isPinned && (
              <span className="mono-tag rounded-sm bg-brand/15 px-1 py-px text-[5px] text-ink-900">
                PIN
              </span>
            )}
          </div>
          <p className="text-[6px] text-ink-500">{age}</p>
        </div>
      </div>

      <p className="mt-2 text-[8px] leading-[1.55] text-ink-700">{body}</p>

      {/* Recent comment preview */}
      {firstComment && (
        <div className="mt-2 flex items-start gap-1.5 border-l border-border pl-2">
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[6px] font-semibold text-canvas">
            {firstComment.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[7px] font-medium text-ink-900">
              {firstComment.name}
            </p>
            <p className="text-[7px] leading-tight text-ink-700">
              {firstComment.body}
            </p>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center gap-3 text-[7px] text-ink-500">
        <span>♥ {likes}</span>
        <span>💬 {comments}</span>
        <span className="ml-auto text-brand">Zobrazit diskuzi →</span>
      </div>
    </article>
  );
}
