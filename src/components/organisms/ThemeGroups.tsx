import { useState } from "react";
import { AGENCY_SHORT, PRESS_THEMES } from "../../lib/constants";
import { titleOf } from "../../lib/format";
import { href } from "../../lib/route";
import type { NewsItem } from "../../types/news";

const SHOW = 5; // 주제마다 처음에 보여줄 개수

const md = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).replace(/\.\s?$/, "");

/**
 * 보도자료 주제별 보기: 주제마다 최신순 타임라인 (날짜 · 기관 · 제목 + 주요 내용 첫 줄)
 * 당국이 한 주제를 어떻게 이어서 다뤄왔는지 한눈에 보이게. 많은 주제가 위로, "기타"는 맨 아래
 */
export function ThemeGroups({ items }: { items: NewsItem[] }) {
  const groups = new Map<string, NewsItem[]>();
  for (const n of items) {
    const t = n.theme ?? "분류 중";
    groups.set(t, [...(groups.get(t) ?? []), n]);
  }
  const order = [...groups.entries()].sort(([a, x], [b, y]) => {
    const tail = (t: string) => (t === "기타" ? 1 : 0) + (t === "분류 중" ? 2 : 0);
    return tail(a) - tail(b) || y.length - x.length || PRESS_THEMES.indexOf(a) - PRESS_THEMES.indexOf(b);
  });

  return (
    <div className="mt-6">
      {/* 주제 바로가기 */}
      <nav aria-label="Themes" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {order.map(([t, list]) => (
          <button
            key={t}
            type="button"
            onClick={() => document.getElementById(`theme-${t}`)?.scrollIntoView({ behavior: "smooth" })}
            className="text-ink-soft hover:text-ink hover:underline"
          >
            {t} <span className="text-muted tabular-nums">{list.length}</span>
          </button>
        ))}
      </nav>

      <div className="mt-4 grid gap-x-12 lg:grid-cols-2">
        {order.map(([t, list]) => (
          <ThemeSection key={t} theme={t} items={list} />
        ))}
      </div>
    </div>
  );
}

function ThemeSection({ theme, items }: { theme: string; items: NewsItem[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, SHOW);
  return (
    <section id={`theme-${theme}`} className="mt-8 scroll-mt-20">
      <h3 className="flex items-baseline justify-between border-b-2 border-ink pb-1.5">
        <span className="font-serif text-xl font-bold">{theme}</span>
        <span className="text-sm text-muted tabular-nums">{items.length}</span>
      </h3>
      <ol>
        {shown.map((n) => (
          <li key={n.id} className="border-b border-rule">
            <a href={href.article(n.id)} className="group grid grid-cols-[3.2rem_1fr] gap-x-3 py-3">
              <span className="pt-0.5 text-xs text-muted tabular-nums">
                {md(n.publishedAt)}
                <span className="mt-0.5 block font-semibold text-ink-soft">{AGENCY_SHORT[n.source] ?? n.source}</span>
              </span>
              <span className="min-w-0">
                <span className="block font-serif leading-snug font-bold group-hover:text-ink-soft">{titleOf(n)}</span>
                {n.keyPoints?.[0] && (
                  <span className="mt-1 line-clamp-1 text-sm text-muted">{n.keyPoints[0]}</span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ol>
      {items.length > SHOW && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 text-sm font-semibold hover:underline">
          {open ? "접기" : `${items.length - SHOW}개 더 보기`}
        </button>
      )}
    </section>
  );
}
