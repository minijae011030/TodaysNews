import { pageList } from "../../lib/pagination";

/**
 * 신문 하단 쪽번호 느낌의 페이지네이션
 * 폰(좁은 화면)에서는 이전/다음을 화살표로, 쪽번호는 현재 페이지만 (1 … 5 … 41) → 가로 스크롤 방지
 */
export function Pagination({
  current,
  total,
  hrefFor,
  onSelect,
}: {
  current: number;
  total: number;
  hrefFor: (page: number) => string;
  onSelect?: (page: number) => void; // 주소를 안 바꾸고 화면 안에서만 페이지를 바꿀 때 (용어 사전)
}) {
  if (total <= 1) return null;

  const pages = (siblings: number, className: string) => (
    <ol className={`items-center gap-1 ${className}`}>
      {pageList(current, total, siblings).map((p, i) =>
        p === "gap" ? (
          <li key={`gap-${i}`} className="px-0.5 text-muted" aria-hidden>
            …
          </li>
        ) : (
          <li key={p}>
            <a
              href={hrefFor(p)}
              data-page={p}
              aria-current={p === current ? "page" : undefined}
              className={`inline-block min-w-8 py-1.5 text-center font-serif tabular-nums sm:min-w-9 ${
                p === current ? "border-b-2 border-ink font-bold text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {p}
            </a>
          </li>
        ),
      )}
    </ol>
  );

  const edge = (page: number, enabled: boolean, text: string, arrow: string) => {
    const inner = (
      <>
        <span className="sm:hidden" aria-hidden>
          {arrow}
        </span>
        <span className="hidden sm:inline">{text}</span>
      </>
    );
    const base = "shrink-0 px-2 py-1 text-sm";
    return enabled ? (
      <a href={hrefFor(page)} data-page={page} aria-label={text} className={`${base} hover:underline`}>
        {inner}
      </a>
    ) : (
      <span className={`${base} text-rule`} aria-hidden>
        {inner}
      </span>
    );
  };

  return (
    <nav
      aria-label="Pagination"
      className="mt-10 flex items-center justify-between gap-2 font-sans sm:gap-4"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>("[data-page]");
        if (!onSelect || !a) return;
        e.preventDefault();
        onSelect(Number(a.dataset.page));
      }}
    >
      {edge(current - 1, current > 1, "Previous", "←")}
      {pages(0, "flex sm:hidden")}
      {pages(1, "hidden sm:flex")}
      {edge(current + 1, current < total, "Next", "→")}
    </nav>
  );
}
