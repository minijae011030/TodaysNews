import { useEffect, useMemo, useState } from "react";
import { Notice } from "../components/atoms/Notice";
import { Pagination } from "../components/molecules/Pagination";
import { SearchIcon } from "../components/atoms/SearchIcon";
import { chosungOf, initialOf, isChosungQuery, termKey, type TermInfo } from "../lib/glossary";
import { href } from "../lib/route";
import { PRESS_THEMES } from "../lib/constants";
import { matchingItems } from "../lib/search";
import type { NewsItem } from "../types/news";

type Sort = "abc" | "frequent" | "recent" | "theme";
const SORTS: { key: Sort; name: string }[] = [
  { key: "abc", name: "가나다순" },
  { key: "frequent", name: "자주 나온 순" },
  { key: "recent", name: "최근 추가" },
  { key: "theme", name: "주제별" },
];
const readSort = (): Sort => {
  try {
    const v = localStorage.getItem("glossarySort");
    return SORTS.some((x) => x.key === v) ? (v as Sort) : "abc";
  } catch {
    return "abc";
  }
};
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00+09:00`).toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });

/** 용어 사전: 기사에서 모인 경제·금융 용어. 가나다순 / 자주 나온 순 / 최근 추가 / 주제별 */
export function GlossaryPage({
  lookup,
  items,
  focus,
}: {
  lookup: Map<string, TermInfo>;
  items: NewsItem[];
  focus?: string; // #/glossary?t=DSR 처럼 들어오면 그 용어로 스크롤
}) {
  const [filter, setFilter] = useState("");
  const [essential, setEssential] = useState(false); // 필수 용어만
  const [sort, setSortState] = useState<Sort>(readSort); // 고른 정렬은 이 기기에 기억
  const setSort = (v: Sort) => {
    setSortState(v);
    try {
      localStorage.setItem("glossarySort", v);
    } catch {}
  };
  const entries = useMemo(
    () => [...new Set(lookup.values())].sort((a, b) => a.term.localeCompare(b.term, "ko")),
    [lookup],
  );

  // 용어마다 관련 기사 + 그 기사들(보도자료)에서 가장 많이 나온 주제: 기사 목록이 바뀔 때만 한 번 계산
  const stats = useMemo(() => {
    const map = new Map<string, { related: number; theme: string }>();
    for (const e of entries) {
      const hits = matchingItems(items, e.term);
      const count = new Map<string, number>();
      for (const n of hits) if (n.theme && n.theme !== "기타") count.set(n.theme, (count.get(n.theme) ?? 0) + 1);
      const theme = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "기타";
      map.set(e.term, { related: hits.length, theme });
    }
    return map;
  }, [entries, items]);
  const related_ = useMemo(() => new Map([...stats].map(([t, s]) => [t, s.related])), [stats]);

  // 찾기: 글자 그대로, 또는 자음만 치면 초성으로 (ㄱㅁㄷ → 공매도)
  const shown = useMemo(() => {
    const q = filter.trim();
    const base = essential ? entries.filter((e) => e.level === 1) : entries;
    if (!q) return base;
    const names = (e: TermInfo) => [e.term, ...(e.aliases ?? [])];
    if (isChosungQuery(q)) {
      const c = q.replace(/\s+/g, "");
      return base.filter((e) => names(e).some((t) => chosungOf(t).includes(c)));
    }
    const f = termKey(q);
    return base.filter((e) => names(e).some((t) => termKey(t).includes(f)) || e.definition.includes(q));
  }, [entries, filter, essential]);

  // 정렬에 따라 묶음: 가나다순은 초성별, 최근 추가는 날짜별, 주제별은 보도자료 주제별, 자주 나온 순은 묶지 않음
  const groups = useMemo((): [string, TermInfo[]][] => {
    if (sort === "frequent") {
      return [["", [...shown].sort((a, b) => (related_.get(b.term) ?? 0) - (related_.get(a.term) ?? 0) || a.term.localeCompare(b.term, "ko"))]];
    }
    const key =
      sort === "recent" ? (e: TermInfo) => e.addedAt : sort === "theme" ? (e: TermInfo) => stats.get(e.term)?.theme ?? "기타" : (e: TermInfo) => initialOf(e.term);
    const map = new Map<string, TermInfo[]>();
    for (const e of shown) map.set(key(e), [...(map.get(key(e)) ?? []), e]);
    const list = [...map.entries()];
    if (sort === "recent") list.sort((a, b) => b[0].localeCompare(a[0]));
    if (sort === "theme")
      list.sort(
        ([a, x], [b, y]) => Number(a === "기타") - Number(b === "기타") || y.length - x.length || PRESS_THEMES.indexOf(a) - PRESS_THEMES.indexOf(b),
      );
    return list.map(([g, l]) => [sort === "recent" ? dayLabel(g) : g, l]);
  }, [shown, sort, related_, stats]);

  // 한 번에 한 묶음만 보여줌 (초성·날짜·주제가 곧 "페이지"). 찾기 중엔 걸린 것 전부
  // 자주 나온 순은 묶음이 없어서 20개씩 페이지로
  const [picked, setPicked] = useState<string>();
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPicked(undefined);
    setPage(1);
  }, [sort, filter, essential]);
  const paged = sort === "frequent";
  const current = filter || paged ? undefined : groups.some(([g]) => g === picked) ? picked : groups[0]?.[0];
  const visibleGroups = current === undefined ? groups : groups.filter(([g]) => g === current);
  const PAGE = 20;
  const freqList = paged ? (groups[0]?.[1] ?? []) : [];
  const totalPages = Math.max(1, Math.ceil(freqList.length / PAGE));
  const pick = (g: string) => {
    setPicked(g);
    document.getElementById("glossary-list")?.scrollIntoView({ block: "start" });
  };

  const focusId = focus ? `term-${termKey(lookup.get(termKey(focus))?.term ?? focus)}` : undefined;
  // #/glossary?t=DSR 로 들어오면: 그 용어가 있는 묶음(페이지)을 열고 스크롤
  useEffect(() => {
    if (!focus) return;
    const term = lookup.get(termKey(focus))?.term;
    if (!term) return;
    if (paged) {
      const i = freqList.findIndex((e) => e.term === term);
      if (i >= 0) setPage(Math.floor(i / PAGE) + 1);
    } else {
      const g = groups.find(([, l]) => l.some((e) => e.term === term))?.[0];
      if (g !== undefined) setPicked(g);
    }
  }, [focus, lookup, groups, paged, freqList]);
  useEffect(() => {
    if (!focusId) return;
    requestAnimationFrame(() => document.getElementById(focusId)?.scrollIntoView({ block: "center" }));
  }, [focusId, current, page]);

  return (
    // 용어가 적어도 화면을 채워서 푸터가 바로 올라오지 않게 (검색 화면과 같은 방식)
    <main className="min-h-[calc(100svh-14rem)]">
      <h2 className="mt-8 font-serif text-4xl font-bold">용어 사전</h2>
      <p className="mt-1 text-sm text-muted">
        {entries.length} terms from press releases, economy and politics stories. Definitions are written by AI.
      </p>

      {entries.length === 0 ? (
        <Notice>The glossary will fill up as new stories come in.</Notice>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-3 border-b-2 border-ink pb-2">
            <SearchIcon className="size-5 shrink-0" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a term"
              aria-label="Find a term"
              className="min-w-0 flex-1 bg-transparent font-serif text-xl outline-none placeholder:text-muted"
            />
          </div>

          {/* 정렬 (고른 건 이 기기에 기억) + 필수만 */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="정렬" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {SORTS.map((o) => (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={sort === o.key}
                onClick={() => setSort(o.key)}
                className={sort === o.key ? "font-semibold text-ink underline underline-offset-4" : "text-muted hover:text-ink"}
              >
                {o.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={essential}
            onClick={() => setEssential((v) => !v)}
            className={`border px-3 py-1 text-sm ${essential ? "border-ink bg-ink font-semibold text-paper" : "border-ink/25 text-ink-soft hover:border-ink"}`}
          >
            필수만 <span className="tabular-nums opacity-70">{entries.filter((e) => e.level === 1).length}</span>
          </button>
          </div>

          {/* 묶음 고르기 (초성·날짜·주제): 스크롤해도 위(작은 헤더 바로 아래)에 붙어 있고, 지금 묶음은 검게 */}
          {!filter && !paged && groups.length > 1 && (
            <nav
              aria-label="Index"
              className="sticky top-12 z-20 -mx-4 mt-4 border-b border-rule bg-paper/95 px-4 backdrop-blur sm:top-14 sm:-mx-6 sm:px-6"
            >
              <div className="no-scrollbar flex gap-1 overflow-x-auto overscroll-x-none py-2 text-sm">
                {groups.map(([g]) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => pick(g)}
                    aria-current={current === g ? "true" : undefined}
                    className={`min-w-8 shrink-0 px-1.5 py-1 font-semibold transition-colors ${
                      current === g ? "bg-ink text-paper" : "text-muted hover:text-ink"
                    }`}
                  >
                    {g}
                    {sort !== "abc" && <span className="ml-1 font-normal opacity-60">{groups.find(([x]) => x === g)?.[1].length}</span>}
                  </button>
                ))}
              </div>
            </nav>
          )}

          {shown.length === 0 && <Notice>No terms match &ldquo;{filter.trim()}&rdquo;.</Notice>}

          <div id="glossary-list" className="scroll-mt-28 sm:scroll-mt-32" />
          {(paged ? [["", freqList.slice((page - 1) * PAGE, page * PAGE)] as [string, TermInfo[]]] : visibleGroups).map(([g, list]) => (
            <section key={g || "all"} id={`group-${g}`} className="mt-8 scroll-mt-28 sm:scroll-mt-32">
              {g && <h3 className="border-b-2 border-ink pb-1 font-serif text-2xl font-bold">{g}</h3>}
              <dl className="lg:grid lg:grid-cols-2 lg:gap-x-12">
                {list.map((e) => {
                  const id = `term-${termKey(e.term)}`;
                  const related = related_.get(e.term) ?? 0;
                  return (
                    <div
                      key={e.term}
                      id={id}
                      className={`border-b border-rule py-5 ${id === focusId ? "border-l-[3px] border-l-ink pl-4" : ""}`}
                    >
                      <dt className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-serif text-lg font-bold">{e.term}</span>
                        {e.level === 1 && (
                          <span className="border border-ink px-1 text-[0.65rem] leading-tight font-semibold">필수</span>
                        )}
                        {e.aliases && e.aliases.length > 0 && (
                          <span className="text-sm text-muted">{e.aliases.join(" · ")}</span>
                        )}
                      </dt>
                      <dd className="mt-1.5 font-serif leading-[1.75] text-ink-soft">{e.definition}</dd>
                      {e.concept && (
                        <dd className="mt-2 text-sm text-muted">오늘의 개념 · {e.concept.date}</dd>
                      )}
                      {related > 0 && (
                        <dd className="mt-2 text-sm">
                          <a href={href.search(e.term)} className="font-semibold hover:underline">
                            관련 기사 {related} &rarr;
                          </a>
                        </dd>
                      )}
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}

          {/* 다음 묶음으로 / 자주 나온 순 페이지 */}
          {paged ? (
            <Pagination
              current={page}
              total={totalPages}
              hrefFor={() => "#/glossary"}
              onSelect={(p) => {
                setPage(p);
                document.getElementById("glossary-list")?.scrollIntoView({ block: "start" });
              }}
            />
          ) : (
            current !== undefined && <NextGroup groups={groups} current={current} onPick={pick} />
          )}
        </>
      )}
    </main>
  );
}

/** 묶음 끝: ← 이전 묶음 · 다음 묶음 → (초성 ㄱ 다음은 ㄴ …) */
function NextGroup({ groups, current, onPick }: { groups: [string, TermInfo[]][]; current: string; onPick: (g: string) => void }) {
  const i = groups.findIndex(([g]) => g === current);
  const prev = groups[i - 1]?.[0];
  const next = groups[i + 1]?.[0];
  if (prev === undefined && next === undefined) return null;
  const btn = "px-2 py-1 text-sm hover:underline";
  return (
    <nav aria-label="Groups" className="mt-10 flex items-center justify-between font-sans">
      {prev !== undefined ? (
        <button type="button" onClick={() => onPick(prev)} className={btn}>
          &larr; {prev}
        </button>
      ) : (
        <span />
      )}
      {next !== undefined && (
        <button type="button" onClick={() => onPick(next)} className={`${btn} font-semibold`}>
          {next} &rarr;
        </button>
      )}
    </nav>
  );
}
