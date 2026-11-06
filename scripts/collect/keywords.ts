// 키워드 관리 (keywords.json)
// 1) 성적표: 검색어마다 실린 기사·숨긴 기사 수를 세서, 며칠째 실린 게 없으면 "죽은 키워드"로 표시
// 2) 핫 키워드: 일주일에 한 번 최근 헤드라인을 보고 요즘 뜨는 검색어를 Gemini가 골라 2주 동안만 추가로 검색
// 3) 자동 휴면: 고정 키워드가 2주째 죽어 있으면 평소엔 안 돌리고 하루 첫 수집 때만 확인 → 기사가 실리면 저절로 깨어남
//    (feeds.json은 그대로. "은행 횡령"처럼 사고 날 때만 나오는 키워드도 하루 안에 다시 잡힘)
import { mkdir, writeFile } from "node:fs/promises";
import { DATA_DIR, KEEP_DAYS, report, type FeedSource, type KeywordRow, type NewsItem } from "./config.ts";
import { callGemini, geminiKey } from "./gemini.ts";
import { kstToday, parseJson, readData } from "./util.ts";

const HOT_SECTIONS = ["경제", "정치", "IT"];
const HOT_DAYS = 14; // 핫 키워드 유지 기간
const HOT_EVERY_DAYS = 7; // 새로 뽑는 주기
const HOT_PER_SECTION = 4; // 섹션당 핫 키워드 최대 수
const SLEEP_AFTER_DAYS = 14; // 이만큼 죽어 있으면 휴면

type Hot = { category: string; query: string; addedAt: string };
type KeywordFile = {
  firstSeen: Record<string, string>; // 검색어를 처음 쓴 날 (새 검색어는 며칠 지켜본 뒤에 죽었다고 판단)
  hot: Hot[];
  hotUpdatedAt?: string;
  deadSince: Record<string, string>; // 실린 기사가 0건이 된 날
  sleeping: Record<string, string>; // 휴면에 들어간 날
  lastProbe?: string; // 휴면 키워드를 마지막으로 확인한 날
};

const daysSince = (date: string) => (Date.parse(kstToday()) - Date.parse(date)) / 86_400_000;

export async function loadKeywords(): Promise<KeywordFile> {
  const k = await readData<KeywordFile>("keywords.json");
  const hot = (k?.hot ?? []).filter((h) => daysSince(h.addedAt) < HOT_DAYS); // 2주 지난 건 자동으로 빠짐
  return {
    firstSeen: k?.firstSeen ?? {},
    hot,
    hotUpdatedAt: k?.hotUpdatedAt,
    deadSince: k?.deadSince ?? {},
    sleeping: k?.sleeping ?? {},
    lastProbe: k?.lastProbe,
  };
}

/** 이번 수집에 돌릴 소스: 휴면 키워드는 빼되, 그날 첫 수집이면 전부 돌려서 깨어날 기회를 줌 */
export function activeSources(k: KeywordFile, sources: FeedSource[]): FeedSource[] {
  const today = kstToday();
  if (k.lastProbe !== today) {
    k.lastProbe = today;
    return sources;
  }
  return sources.filter((s) => !(s.type === "naver" && k.sleeping[s.query]));
}

// 핫 키워드도 네이버 검색으로 (기본: 주요 언론사만)
export const hotSources = (k: KeywordFile): FeedSource[] =>
  k.hot.map((h) => ({ category: h.category, type: "naver", query: h.query }));

// sources: 이번에 돌린 것, all: feeds.json + 핫 키워드 전체 (휴면 포함)
export function scoreKeywords(
  k: KeywordFile,
  sources: FeedSource[],
  all: FeedSource[],
  fetched: NewsItem[],
  items: NewsItem[],
): void {
  const today = kstToday();
  const hotSet = new Set(k.hot.map((h) => h.query));
  const rows: KeywordRow[] = [];
  for (const s of sources) {
    if (s.type !== "naver") continue;
    k.firstSeen[s.query] ??= today;
    const mine = items.filter((n) => n.via === s.query);
    const kept = mine.filter((n) => !n.hidden).length;
    rows.push({
      category: s.category,
      query: s.query,
      hot: hotSet.has(s.query),
      fetchedNow: fetched.filter((n) => n.via === s.query).length,
      kept,
      hidden: mine.length - kept,
      dead: kept === 0 && daysSince(k.firstSeen[s.query]) >= KEEP_DAYS,
      sleeping: false,
    });
  }
  // 휴면 판단 (고정 키워드만. 핫 키워드는 2주면 어차피 빠짐)
  const woke: string[] = [];
  const slept: string[] = [];
  for (const r of rows) {
    if (r.hot) continue;
    if (!r.dead) {
      delete k.deadSince[r.query];
      if (k.sleeping[r.query]) woke.push(r.query);
      delete k.sleeping[r.query];
      continue;
    }
    k.deadSince[r.query] ??= today;
    if (!k.sleeping[r.query] && daysSince(k.deadSince[r.query]) >= SLEEP_AFTER_DAYS) {
      k.sleeping[r.query] = today;
      slept.push(r.query);
    }
    r.sleeping = !!k.sleeping[r.query];
  }
  // 이번에 안 돌린 휴면 키워드도 성적표에 휴면으로 표시
  const ran = new Set(rows.map((r) => r.query));
  for (const s of all)
    if (s.type === "naver" && !ran.has(s.query) && k.sleeping[s.query])
      rows.push({ category: s.category, query: s.query, hot: false, fetchedNow: 0, kept: 0, hidden: 0, dead: true, sleeping: true });

  // feeds.json에서 빠진 검색어는 기록에서도 정리
  const live = new Set(all.flatMap((s) => (s.type === "naver" ? [s.query] : [])));
  for (const rec of [k.firstSeen, k.deadSince, k.sleeping]) for (const q of Object.keys(rec)) if (!live.has(q)) delete rec[q];
  report.keywords = rows;
  report.keywordsWoke = woke;
  report.keywordsSlept = slept;
  const dead = rows.filter((r) => r.dead && !r.sleeping).map((r) => r.query);
  if (dead.length) console.log(`💤 죽은 키워드: ${dead.join(", ")}`);
  if (slept.length) console.log(`😴 휴면 (2주째 0건): ${slept.join(", ")}`);
  if (woke.length) console.log(`☀️  다시 깨어남: ${woke.join(", ")}`);
}

export async function updateHot(k: KeywordFile, fixed: FeedSource[], items: NewsItem[]): Promise<void> {
  const apiKey = geminiKey();
  if (!apiKey) return;
  if (k.hotUpdatedAt && daysSince(k.hotUpdatedAt) < HOT_EVERY_DAYS) return;

  const headlines = Object.fromEntries(
    HOT_SECTIONS.map((c) => [c, items.filter((n) => n.category === c && !n.hidden).slice(0, 60).map((n) => n.titleKo ?? n.title)]),
  );
  if (Object.values(headlines).every((h) => h.length < 10)) return; // 기사가 너무 적으면 다음에
  const existing = [...fixed.flatMap((s) => (s.type === "naver" ? [s.query] : [])), ...k.hot.map((h) => h.query)];

  const prompt = `뉴스 큐레이터의 네이버 뉴스 검색어를 고르고 있어. 최근 헤드라인을 보고, 섹션마다 요즘 반복해서 나오는 구체적인 이슈를 검색어 2~3개로 뽑아 JSON 객체 하나로만 답해.
형식: {"경제": ["검색어", ...], "정치": [...], "IT": [...]}
- 검색어는 2~4단어. 사건·법안·기업·인물처럼 구체적으로 (예: "MBK 홈플러스", "가상자산 과세 유예", "조희대 국정조사")
- 헤드라인 여러 건(2건 이상)에 반복해서 나온 이슈만. 한 건짜리 소식, 행사·채용·해커톤·인사 같은 일회성 소식은 빼
- '경제', '주식', '정부' 같은 넓은 단어, 이미 쓰는 검색어와 겹치는 건 빼
- 확실한 게 없으면 그 섹션은 빈 배열이어도 돼
- 정치는 여야가 맞붙는 쟁점 위주, 경제는 금융·시장 이슈 위주, IT는 기술 산업·플랫폼·보안 이슈 위주
이미 쓰는 검색어: ${JSON.stringify(existing)}

최근 헤드라인: ${JSON.stringify(headlines)}`;

  try {
    const out = parseJson<Record<string, string[]>>(await callGemini(apiKey, prompt), "{");
    const today = kstToday();
    const taken = new Set(existing.map((q) => q.replace(/\s+/g, "")));
    const added: Hot[] = [];
    for (const c of HOT_SECTIONS) {
      for (const q of (out[c] ?? []).map((x) => String(x).trim()).slice(0, 3)) {
        const key = q.replace(/\s+/g, "");
        if (q.length < 2 || q.length > 30 || taken.has(key)) continue;
        // 진짜 반복된 이슈인지 확인: 검색어 단어 2개 이상(1단어면 그 단어)이 든 헤드라인이 2건 이상
        const words = q.split(/\s+/);
        const need = Math.min(2, words.length);
        const hits = (headlines[c] ?? []).filter((h) => words.filter((w) => h.includes(w)).length >= need).length;
        if (hits < 2) continue;
        taken.add(key);
        added.push({ category: c, query: q, addedAt: today });
      }
    }
    // 섹션마다 최신 HOT_PER_SECTION개만 유지
    const merged = [...added, ...k.hot];
    k.hot = HOT_SECTIONS.flatMap((c) => merged.filter((h) => h.category === c).slice(0, HOT_PER_SECTION));
    k.hotUpdatedAt = today;
    report.newHot = added.map((h) => `${h.category}:${h.query}`);
    console.log(`🔥 핫 키워드 +${added.length}: ${added.map((h) => h.query).join(", ")}`);
  } catch (e) {
    console.warn(`⚠️  핫 키워드 실패: ${(e as Error).message}`);
  }
}

export async function saveKeywords(k: KeywordFile): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(`${DATA_DIR}/keywords.json`, JSON.stringify(k, null, 2));
}
