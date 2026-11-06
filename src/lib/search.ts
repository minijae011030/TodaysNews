import { AGENCY_SHORT } from "./constants";
import type { NewsItem } from "../types/news";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// 기사마다 검색용 글자(소문자·공백 정리)를 한 번만 만들어 두고 재사용
// (용어 사전은 용어 수 × 기사 수만큼 검색해서, 매번 만들면 아주 느려짐)
const cache = new WeakMap<NewsItem, { title: string; body: string }>();
function textOf(n: NewsItem) {
  let t = cache.get(n);
  if (!t) {
    t = {
      title: norm(`${n.title} ${n.titleKo ?? ""}`),
      body: norm(
        [
          n.summary,
          n.snippet,
          n.essayPoint,
          n.spaceFact,
          n.source,
          AGENCY_SHORT[n.source],
          n.category,
          n.label,
          ...(n.tags ?? []),
          ...(n.keyPoints ?? []),
        ]
          .filter(Boolean)
          .join(" "),
      ),
    };
    cache.set(n, t);
  }
  return t;
}

/**
 * 띄어쓴 단어가 모두 들어간 기사만 (제목·요약·태그·출처·주요 내용 등에서)
 * 제목에 걸린 기사를 먼저, 그다음은 최신순
 */
export function searchItems(items: NewsItem[], query: string): NewsItem[] {
  const terms = norm(query).split(" ").filter(Boolean);
  if (terms.length === 0) return [];
  const scored: { n: NewsItem; inTitle: number }[] = [];
  for (const n of items) {
    const { title, body } = textOf(n);
    if (!terms.every((t) => title.includes(t) || body.includes(t))) continue;
    scored.push({ n, inTitle: terms.filter((t) => title.includes(t)).length });
  }
  return scored
    .sort((a, b) => b.inTitle - a.inTitle || b.n.publishedAt.localeCompare(a.n.publishedAt))
    .map((s) => s.n);
}

/** 검색어가 든 기사들 (정렬 없이, 원래 순서 그대로) */
export function matchingItems(items: NewsItem[], query: string): NewsItem[] {
  const terms = norm(query).split(" ").filter(Boolean);
  if (terms.length === 0) return [];
  return items.filter((n) => {
    const { title, body } = textOf(n);
    return terms.every((t) => title.includes(t) || body.includes(t));
  });
}

/** 개수만 필요할 때 (정렬 없이 빠르게) */
export function countMatches(items: NewsItem[], query: string): number {
  const terms = norm(query).split(" ").filter(Boolean);
  if (terms.length === 0) return 0;
  let c = 0;
  for (const n of items) {
    const { title, body } = textOf(n);
    if (terms.every((t) => title.includes(t) || body.includes(t))) c++;
  }
  return c;
}
