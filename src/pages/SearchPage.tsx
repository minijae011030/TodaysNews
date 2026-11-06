import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "../components/atoms/SearchIcon";
import { Pagination } from "../components/molecules/Pagination";
import { StoryListItem } from "../components/molecules/StoryListItem";
import { PAGE_SIZE } from "../lib/constants";
import { href } from "../lib/route";
import { searchItems } from "../lib/search";
import type { NewsItem } from "../types/news";

/** 검색: 입력하는 대로 결과가 바뀌고, 주소(#/search?q=)에도 남아서 뒤로 가기·공유가 됨 */
export function SearchPage({ q, page, items }: { q: string; page: number; items: NewsItem[] }) {
  const [query, setQuery] = useState(q); // 입력창 글자
  const [searched, setSearched] = useState(q); // 실제로 검색한 글자 (입력이 멈추고 잠깐 뒤에 반영)
  const [currentPage, setCurrentPage] = useState(page);
  const input = useRef<HTMLInputElement>(null);

  // 다른 곳에서 주소가 바뀌면 (뒤로 가기, 페이지 이동) 따라감
  useEffect(() => {
    setQuery(q);
    setSearched(q);
    setCurrentPage(page);
  }, [q, page]);

  // 디바운스: 타이핑(한글 조합 포함)이 300ms 멈추면 그때 검색
  useEffect(() => {
    const t = setTimeout(() => setSearched(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!q) input.current?.focus();
  }, [q]);

  // 검색할 때 기록은 안 쌓고 주소만 바꿈 (뒤로 가기 한 번에 검색 전으로)
  useEffect(() => {
    const next = href.search(searched.trim(), currentPage);
    if (window.location.hash !== next) history.replaceState(null, "", next);
  }, [searched, currentPage]);

  const results = useMemo(() => searchItems(items, searched), [items, searched]);

  // 빈 화면 채우기: 최근 기사에 많이 나온 태그를 추천 검색어로
  const trending = useMemo(() => {
    const count = new Map<string, number>();
    for (const n of items.slice(0, 200)) for (const t of n.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t]) => t);
  }, [items]);
  const pick = (t: string) => {
    setQuery(t);
    setSearched(t);
    setCurrentPage(1);
  };
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const current = Math.min(currentPage, totalPages);
  const visible = results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const trimmed = searched.trim();

  return (
    // 결과가 적어도 화면을 채워서 푸터가 바로 올라오지 않게
    <main className="min-h-[calc(100svh-14rem)]">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearched(query); // 엔터는 바로 검색
          input.current?.blur(); // 폰에서 키보드 내리기
        }}
        className="mt-8 flex items-center gap-3 border-b-2 border-ink pb-2"
      >
        <SearchIcon className="size-6 shrink-0" />
        <input
          ref={input}
          type="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrentPage(1);
          }}
          placeholder="Search stories"
          aria-label="Search stories"
          className="min-w-0 flex-1 bg-transparent font-serif text-2xl outline-none placeholder:text-muted sm:text-3xl"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSearched("");
              input.current?.focus();
            }}
            className="shrink-0 text-sm text-muted hover:text-ink"
          >
            Clear
          </button>
        )}
      </form>

      {trimmed ? (
        <p className="mt-3 text-sm text-muted">
          {results.length} {results.length === 1 ? "result" : "results"} for &ldquo;{trimmed}&rdquo;
        </p>
      ) : null}

      {/* 검색 전이거나 결과가 없을 때: 요즘 많이 나오는 주제 */}
      {(!trimmed || results.length === 0) && trending.length > 0 && (
        <section className="mt-5">
          <ul className="flex flex-wrap gap-2">
            {trending.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => pick(t)}
                  className="border border-ink/20 px-3.5 py-1.5 font-serif text-[0.95rem] hover:border-ink hover:bg-ink hover:text-paper"
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {visible.length > 0 && (
        <ul className="mt-6 border-t border-ink">
          {visible.map((n) => (
            <StoryListItem key={n.id} item={n} />
          ))}
        </ul>
      )}

      <Pagination
        current={current}
        total={totalPages}
        hrefFor={(p) => href.search(trimmed, p)}
      />
    </main>
  );
}
