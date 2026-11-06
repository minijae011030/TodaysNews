import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { THEME_RENAME } from "../lib/constants";
import { fetchData } from "../lib/data";
import type { Concept, NewsItem, SpacePhoto } from "../types/news";

// 데이터 정리: 숨긴 기사·없앤 섹션 빼고, 섹션 개편 전 데이터도 새 섹션으로 보이게
const MIGRATE: Record<string, string> = { 국제: "경제", 우주: "과학", 예술: "문화", 책: "문화", 엔터: "문화" };
function normalize(all: NewsItem[]): NewsItem[] {
  return all
    .filter((n) => !n.hidden && n.category !== "사회")
    .map((n) =>
      n.label === "보도자료" // 보도자료는 경제 탭에 있다가 따로 탭이 생김
        ? { ...n, category: "보도자료", ...(n.theme && THEME_RENAME[n.theme] ? { theme: THEME_RENAME[n.theme] } : {}) }
        : MIGRATE[n.category]
          ? { ...n, category: MIGRATE[n.category] }
          : n,
    );
}

/** 기사 목록 + 보도자료 보관소(필요할 때만) + 오늘의 개념 + 당겨서 새로고침 */
export function useNews() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0); // 새로고침할 때마다 +1 (푸터도 다시 불러오게)
  const [concept, setConcept] = useState<Concept | null>(null);
  const [space, setSpace] = useState<SpacePhoto | null>(null);

  const load = useCallback(async (): Promise<NewsItem[]> => {
    const r = await fetchData("news.json");
    if (!r.ok) throw new Error(String(r.status));
    return normalize(await r.json());
  }, []);

  // 보도자료 보관소 (3달치): 처음엔 안 받고, 보도자료 탭·검색·사전·오래된 공유 링크에서 필요할 때만
  const [archive, setArchive] = useState<NewsItem[] | null>(null);
  const archiveLoading = useRef(false);
  const loadArchive = useCallback(async () => {
    if (archiveLoading.current) return;
    archiveLoading.current = true;
    try {
      const r = await fetchData("press.json");
      setArchive(r.ok ? normalize(await r.json()) : []);
    } catch {
      setArchive([]);
    } finally {
      archiveLoading.current = false;
    }
  }, []);

  // 기사 + 보관소를 합친 목록 (같은 글은 news.json 쪽), 최신순
  const allItems = useMemo(() => {
    if (!items || !archive) return items;
    const ids = new Set(items.map((n) => n.id));
    return [...items, ...archive.filter((n) => !ids.has(n.id))].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }, [items, archive]);

  useEffect(() => {
    load()
      .then(setItems)
      .catch(() => setError(true));
  }, [load]);

  // 오늘의 개념 (하루 한 번 갱신, 새로고침하면 다시 확인)
  useEffect(() => {
    fetchData("concept.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConcept(d?.history?.[0] ?? null))
      .catch(() => {});
    // 오늘의 우주 사진 (NASA APOD)
    fetchData("space.json")
      .then((r) => (r.ok ? r.json() : null))
      // 진짜 APOD 사진·영상일 때만 1면 톱으로 (아니면 기사로 대체)
      .then((d) => {
        const apod = /apod\.nasa\.gov\/apod\/image\/|assets\.science\.nasa\.gov\/.*\/apod\//;
        const ok =
          (d?.image && (apod.test(d.image) || /img\.youtube\.com|vimeocdn/.test(d.image))) ||
          (d?.video && apod.test(d.video)) ||
          (d?.embed && /youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\//.test(d.embed));
        setSpace(ok ? d : null);
      })
      .catch(() => {});
  }, [version]);

  // 당겨서 새로고침: 새로 들어온 기사 수를 돌려줌
  const refresh = useCallback(async (): Promise<number | null> => {
    try {
      const next = await load();
      const before = new Set(items?.map((n) => n.id));
      setItems(next);
      if (archive) void loadArchive(); // 보관소를 받아둔 상태면 같이 새로
      setError(false);
      setVersion((v) => v + 1);
      return next.filter((n) => !before.has(n.id)).length;
    } catch {
      return null;
    }
  }, [load, items, archive, loadArchive]);

  return { items, allItems, archiveLoaded: archive !== null, loadArchive, error, version, concept, space, refresh };
}
