import { Fragment, useEffect, useMemo, useState } from "react";
import { AGENCY_SHORT, PRESS_THEMES, THEME_SHORT } from "../../lib/constants";
import { fetchData } from "../../lib/data";
import { titleOf } from "../../lib/format";
import { href } from "../../lib/route";
import type { NewsItem } from "../../types/news";

// 그 날짜가 속한 주의 월요일 (KST) — 수집 스크립트 pressWeekly.ts와 같은 규칙
function weekOf(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3600_000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const weekLabel = (w: string) => {
  const [, m, d] = w.split("-").map(Number);
  return `${m}.${d}`;
};
// 진하기: 0 · 1 · 2~3 · 4~5 · 6+ (흑백 화면에서도 단계가 보이게)
const shade = (n: number) =>
  n === 0
    ? ""
    : n === 1
      ? "bg-ink/15"
      : n <= 3
        ? "bg-ink/35"
        : n <= 5
          ? "bg-ink/60 text-paper"
          : "bg-ink text-paper";

type Weekly = Record<string, { summary: string }>;

/**
 * 보도자료 흐름: 주(세로) × 주제(가로) 표. 칸이 진할수록 그 주에 그 주제 보도자료가 많음
 * 주마다 한 줄 요약(press-weekly.json), 칸을 누르면 그 주·그 주제 보도자료가 바로 아래 펼쳐짐
 */
export function PressFlow({ items }: { items: NewsItem[] }) {
  const [weekly, setWeekly] = useState<Weekly>({});
  useEffect(() => {
    fetchData("press-weekly.json")
      .then((r) => (r.ok ? r.json() : { weeks: {} }))
      .then((d) => setWeekly(d.weeks ?? {}))
      .catch(() => {});
  }, []);

  const { weeks, themes, cell } = useMemo(() => {
    const cell = new Map<string, NewsItem[]>(); // "주|주제" → 보도자료
    const total = new Map<string, number>();
    const weekSet = new Set<string>();
    for (const n of items) {
      const w = weekOf(n.publishedAt);
      const t = n.theme ?? "기타";
      weekSet.add(w);
      cell.set(`${w}|${t}`, [...(cell.get(`${w}|${t}`) ?? []), n]);
      total.set(t, (total.get(t) ?? 0) + 1);
    }
    // 주제는 3달 동안 많았던 순 (기타는 맨 끝)
    const themes = PRESS_THEMES.filter((t) => total.has(t)).sort(
      (a, b) =>
        Number(a === "기타") - Number(b === "기타") ||
        (total.get(b) ?? 0) - (total.get(a) ?? 0),
    );
    return { weeks: [...weekSet].sort().reverse(), themes, cell };
  }, [items]);

  const [open, setOpen] = useState<string>(); // "주|주제"
  const opened = open ? (cell.get(open) ?? []) : [];

  if (weeks.length === 0) return null;
  return (
    <div className="mt-6">
      {/* <p className="text-sm text-muted">칸이 진할수록 그 주에 그 주제 보도자료가 많았다는 뜻입니다. 칸을 누르면 목록이 열립니다.</p> */}

      {/* 폰에선 가로로 넘겨 보기. 주 칸은 왼쪽에 고정 */}
      <div className="no-scrollbar mt-4 overflow-x-auto overscroll-x-none border-t border-ink">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink">
              <th className="sticky left-0 z-10 w-16 bg-paper py-2 text-left text-xs font-semibold text-muted">
                주
              </th>
              {themes.map((t) => (
                <th
                  key={t}
                  title={t}
                  className="px-0.5 py-2 text-center text-[0.7rem] font-semibold whitespace-nowrap text-ink-soft"
                >
                  {THEME_SHORT[t] ?? t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => {
              const openHere = open?.startsWith(`${w}|`);
              return (
                <Fragment key={w}>
                  <tr className="border-b border-rule">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-paper py-1.5 pr-2 text-left align-top text-xs font-semibold tabular-nums"
                    >
                      {weekLabel(w)}
                    </th>
                    {themes.map((t) => {
                      const n = cell.get(`${w}|${t}`)?.length ?? 0;
                      const key = `${w}|${t}`;
                      return (
                        <td key={t} className="p-0.5">
                          <button
                            type="button"
                            disabled={n === 0}
                            onClick={() =>
                              setOpen(open === key ? undefined : key)
                            }
                            aria-label={`${weekLabel(w)} 주 ${t} ${n}건`}
                            aria-expanded={open === key}
                            className={`flex h-7 w-full items-center justify-center text-[0.7rem] tabular-nums ${shade(n)} ${
                              open === key
                                ? "outline-2 outline-offset-[-2px] outline-ink"
                                : ""
                            } ${n ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                          >
                            {n || ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  {/* 주간 한 줄 */}
                  {weekly[w]?.summary && (
                    <tr>
                      <td />
                      <td
                        colSpan={themes.length}
                        className="pt-1 pb-3 font-serif text-[0.95rem] leading-snug text-ink-soft"
                      >
                        {weekly[w].summary}
                      </td>
                    </tr>
                  )}
                  {/* 누른 칸의 보도자료 */}
                  {openHere && (
                    <tr>
                      <td />
                      <td colSpan={themes.length} className="pt-4 pb-8">
                        <p className="mb-2 text-xs font-semibold text-muted">
                          {weekLabel(w)} 주 · {open!.split("|")[1]}{" "}
                          {opened.length}건
                        </p>
                        <ul className="border-t border-ink">
                          {opened.map((n) => (
                            <li key={n.id} className="border-b border-rule">
                              <a
                                href={href.article(n.id)}
                                className="group flex gap-3 py-2"
                              >
                                <span className="w-12 shrink-0 text-xs text-muted">
                                  {AGENCY_SHORT[n.source] ?? n.source}
                                </span>
                                <span className="font-serif leading-snug font-bold group-hover:text-ink-soft">
                                  {titleOf(n)}
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
