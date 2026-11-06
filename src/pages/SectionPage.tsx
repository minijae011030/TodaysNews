import { Fragment, useEffect, useMemo, useState } from "react";
import { SearchIcon } from "../components/atoms/SearchIcon";
import { Notice } from "../components/atoms/Notice";
import { DateField } from "../components/molecules/DateField";
import { FilterTabs } from "../components/molecules/FilterTabs";
import { Pagination } from "../components/molecules/Pagination";
import { StoryListItem } from "../components/molecules/StoryListItem";
import { SpaceFeature } from "../components/organisms/SpaceFeature";
import { ThemeGroups } from "../components/organisms/ThemeGroups";
import { AGENCY_SHORT, PAGE_SIZE, PRESS } from "../lib/constants";
import { href } from "../lib/route";
import { searchItems } from "../lib/search";
import type { NewsItem, SpacePhoto } from "../types/news";

// 보도자료 기간 필터: 시작일~종료일 (KST 날짜, 둘 다 포함). 비우면 그쪽은 제한 없음
const kstDate = (iso: string | number) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const inRangeOf = (iso: string, from?: string, to?: string) => {
  const d = kstDate(iso);
  return (!from || d >= from) && (!to || d <= to);
};

const kstDay = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Seoul" });

export function SectionPage({
  section,
  page,
  filter,
  from: fromProp,
  to: toProp,
  q = "",
  view,
  items,
  space = null,
}: {
  section: string;
  page: number;
  filter?: string;
  from?: string; // 보도자료 기간 시작일 (YYYY-MM-DD)
  to?: string; // 보도자료 기간 종료일
  q?: string; // 보도자료 안에서 검색
  view?: string; // 보도자료: "themes"면 주제별 보기
  items: NewsItem[];
  space?: SpacePhoto | null; // 과학 섹션 맨 위: NASA 오늘의 우주 사진·영상
}) {
  // 보도자료 탭은 기관별, 다른 탭은 라벨 붙은 글이 있을 때만 라벨별로 거르는 탭을 보여줌
  const isPress = section === PRESS;
  const groupOf = (n: NewsItem) => (isPress ? n.source : n.label);
  const groups = [...new Set(items.map(groupOf).filter((g): g is string => !!g))];
  const active = filter && groups.includes(filter) ? filter : undefined;

  // 기간: 주소(?from=&to=)에서 시작하되 화면 안에서 바로 바꿈 (주소만 조용히 갱신 → 맨 위로 튀지 않음)
  const [range, setRangeState] = useState({ from: fromProp, to: toProp });
  useEffect(() => setRangeState({ from: fromProp, to: toProp }), [fromProp, toProp]);
  const { from, to } = range;

  // 보도자료 검색어: 치는 대로 바로 거르지 않고 0.3초 멈추면 (한글 조합 중 깜빡임 방지), 주소에도 남김
  const [query, setQuery] = useState(q);
  const [searched, setSearched] = useState(q);
  useEffect(() => {
    setQuery(q);
    setSearched(q);
  }, [q]);
  useEffect(() => {
    const t = setTimeout(() => setSearched(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const byTheme = isPress && view === "themes";
  const opts = { from, to, q: searched || undefined, view: byTheme ? "themes" : undefined };
  useEffect(() => {
    if (!isPress) return;
    const next = href.section(section, 1, active, { from, to, q: searched || undefined, view: byTheme ? "themes" : undefined });
    if (window.location.hash !== next) history.replaceState(null, "", next);
  }, [isPress, section, active, from, to, searched, byTheme]);
  // 날짜 고르기
  const setRange = (next: { from?: string; to?: string }) => {
    let f = "from" in next ? next.from : from;
    let t = "to" in next ? next.to : to;
    if (f && t && f > t) [f, t] = [t, f]; // 거꾸로 고르면 바꿔줌
    setRangeState({ from: f || undefined, to: t || undefined });
  };
  // 달력에서 고를 수 있는 범위: 보관 중인 가장 오래된 보도자료 ~ 오늘
  const oldest = items.length ? kstDate(items[items.length - 1].publishedAt) : undefined;
  const today = kstDate(Date.now());

  const inRange = useMemo(
    () => (isPress ? items.filter((n) => inRangeOf(n.publishedAt, from, to)) : items),
    [isPress, items, from, to],
  );
  const matched = useMemo(() => {
    if (!isPress || !searched) return inRange;
    const hit = new Set(searchItems(inRange, searched).map((n) => n.id));
    return inRange.filter((n) => hit.has(n.id)); // 날짜순 그대로
  }, [isPress, inRange, searched]);
  const shown = active ? matched.filter((n) => groupOf(n) === active) : matched;
  const filtering = isPress && (!!from || !!to || !!searched);

  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  // 화면 안에서 필터를 바꿨으면 1페이지부터
  const changed = from !== fromProp || to !== toProp || searched !== q;
  const current = Math.min(changed ? 1 : page, totalPages);
  const visible = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const showTabs = groups.length > 0;

  return (
    <main>
      <h2 className="mt-8 font-serif text-4xl font-bold">{section}</h2>
      <p className="mt-1 text-sm text-muted">
        {shown.length} {shown.length === 1 ? (isPress ? "release" : "story") : isPress ? "releases" : "stories"}
        {filtering ? (searched ? <> matching &ldquo;{searched}&rdquo;</> : null) : <> from the past {isPress ? "three months" : "three days"}</>}
      </p>

      {/* 보도자료: 기간 + 검색. 신문 목차처럼 가는 세로선으로 나눈 한 줄 (폰: 날짜 두 칸 + 아래 검색) */}
      {isPress && (
        <div className="mt-6 grid grid-cols-2 border-y border-ink sm:grid-cols-[11rem_11rem_1fr]">
          <DateField label="From" value={from} min={oldest} max={to ?? today} onChange={(v) => setRange({ from: v })} />
          <DateField
            label="To"
            value={to}
            min={from ?? oldest}
            max={today}
            onChange={(v) => setRange({ to: v })}
            className="border-l border-rule pl-4"
          />
          <label className="col-span-2 flex min-w-0 flex-col border-t border-rule py-2.5 sm:col-span-1 sm:border-t-0 sm:border-l sm:pl-4">
            <span className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted uppercase">Search</span>
            <span className="mt-0.5 flex items-center gap-2">
              <SearchIcon className="size-4 shrink-0 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="보도자료에서 찾기"
                aria-label="보도자료에서 찾기"
                className="min-w-0 flex-1 bg-transparent font-serif text-[1.05rem] outline-none placeholder:text-muted"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기" className="px-1.5 text-lg leading-none text-muted hover:text-ink">
                  ×
                </button>
              )}
            </span>
          </label>
        </div>
      )}

      {/* 과학 섹션 첫 페이지 맨 위에만 */}
      {space && current === 1 && !active && (
        <div className="mt-6 border-t-2 border-ink pt-5">
          <SpaceFeature photo={space} />
        </div>
      )}

      {showTabs && (
        <FilterTabs
          options={[
            { key: "all", name: "All", count: matched.length, href: href.section(section, 1, undefined, opts), active: !active },
            ...groups.map((g) => ({
              key: g,
              name: AGENCY_SHORT[g] ?? g,
              count: matched.filter((n) => groupOf(n) === g).length,
              href: href.section(section, 1, g, opts),
              active: active === g,
            })),
          ]}
        />
      )}

      {shown.length === 0 &&
        (filtering ? <Notice>No releases match these filters.</Notice> : <Notice>No stories in this section yet.</Notice>)}

      {/* 보도자료: 날짜순 / 주제별 */}
      {isPress && shown.length > 0 && (
        <div className="mt-5 flex justify-end gap-4 text-sm">
          {[
            { key: undefined, name: "날짜순" },
            { key: "themes", name: "주제별" },
          ].map((v) => {
            const on = (v.key === "themes") === byTheme;
            return (
              <a
                key={v.name}
                href={href.section(section, 1, active, { ...opts, view: v.key })}
                aria-current={on ? "true" : undefined}
                className={on ? "font-semibold text-ink underline underline-offset-4" : "text-muted hover:text-ink"}
              >
                {v.name}
              </a>
            );
          })}
        </div>
      )}

      {byTheme ? (
        <ThemeGroups items={shown} />
      ) : (
      <>
      <ul className={`${showTabs && !isPress ? "mt-0" : "mt-3"} border-t border-ink`}>
        {visible.map((n, i) => {
          // 보도자료는 2주치라 날짜 머리글로 묶음 (10월 28일 화요일)
          const day = isPress ? kstDay(n.publishedAt) : null;
          const newDay = day && (i === 0 || day !== kstDay(visible[i - 1].publishedAt));
          return (
            <Fragment key={n.id}>
              {newDay && (
                <li className={`border-b border-ink pb-2 text-sm font-bold ${i === 0 ? "pt-4" : "pt-10"}`}>{day}</li>
              )}
              <StoryListItem item={n} />
            </Fragment>
          );
        })}
      </ul>

      <Pagination current={current} total={totalPages} hrefFor={(p) => href.section(section, p, active, opts)} />
      </>
      )}
    </main>
  );
}
