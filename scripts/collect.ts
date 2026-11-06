/**
 * 뉴스 수집 스크립트
 * feeds.json → (네이버 뉴스 검색 / RSS / 게시판) 수집 → 중복 제거 → 새 기사 고르기
 *   → 원문·PDF 읽기 → Gemini 요약 → public/data/news.json
 *   + 오늘의 개념(concept.json), 오늘의 우주 사진(space.json), 용어 사전(glossary.json)
 *
 * 실행: npm run collect
 * 환경변수(.env): GEMINI_API_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
 *
 * scripts/collect/
 *   config.ts   설정·타입·실행 기록     sources.ts  RSS·네이버·게시판 수집
 *   article.ts  원문·PDF 읽기           gemini.ts   Gemini 호출
 *   enrich.ts   요약·섹션 확인          concept.ts  오늘의 개념
 *   space.ts    오늘의 우주 사진        output.ts   저장·Actions 요약
 *   glossary.ts 용어 사전              keywords.ts 키워드 성적표·핫 키워드
 */
import { readFile } from "node:fs/promises";
import { DROPPED, KEEP_DAYS, MAX_NEW_BY_SECTION, MAX_NEW_PER_BUCKET, MIGRATE, PRESS_KEEP_DAYS, PRESS_LABEL, report, type FeedSource, type NewsItem } from "./collect/config.ts";
import { fillMissingPdfs, fixTitles } from "./collect/article.ts";
import { backfillPress } from "./collect/backfill.ts";
import { makeConcept } from "./collect/concept.ts";
import { enrich } from "./collect/enrich.ts";
import { StoryIndex, hideDuplicates, isPhotoOnly } from "./collect/dedupe.ts";
import { cleanupGlossary, updateGlossary } from "./collect/glossary.ts";
import { classifyThemes } from "./collect/themes.ts";
import { activeSources, hotSources, loadKeywords, saveKeywords, scoreKeywords, updateHot } from "./collect/keywords.ts";
import { save, writeActionsSummary } from "./collect/output.ts";
import { cleanBoardTitle, fetchSource } from "./collect/sources.ts";
import { makeSpacePhoto } from "./collect/space.ts";
import { readData } from "./collect/util.ts";

const DAY = 24 * 60 * 60 * 1000;

// 지난 수집 결과 (요약은 재사용해서 비용 절약). 섹션 개편 전 데이터는 새 섹션으로 옮김
// (보도자료는 경제 탭 안에 있다가 따로 탭이 생김)
async function loadPrevious(): Promise<Map<string, NewsItem>> {
  // news.json + 보도자료 보관소(press.json). 같은 글이 둘 다 있으면 news.json 쪽(뒤에 오는 것)이 남음
  const prev = [...((await readData<NewsItem[]>("press.json")) ?? []), ...((await readData<NewsItem[]>("news.json")) ?? [])];
  return new Map(
    prev
      .filter((n) => !DROPPED.has(n.category))
      .map((n) => [
        n.key,
        n.label === PRESS_LABEL
          ? { ...n, category: PRESS_LABEL, title: cleanBoardTitle(n.title), keepDays: PRESS_KEEP_DAYS } // 보관 기간은 설정값으로 통일
          : { ...n, category: MIGRATE[n.category] ?? n.category },
      ]),
  );
}

// 묶음(섹션별. 보도자료·기술 블로그처럼 뜸하게 올라오는 소스는 소스별)마다 "이미 실린 가장 최근 기사"보다 새 기사만, 최신순으로 상한까지.
// (이게 없으면 상한에 걸려 못 받은 예전 기사들이 다음 수집마다 줄줄이 다시 들어옴)
function pickNew(fetched: NewsItem[], known: Map<string, NewsItem>): NewsItem[] {
  // 뜸한 소스(보도자료·keepDays 블로그)를 섹션과 같이 세면, 오늘 기사 때문에 며칠 전 블로그 글이 "옛날 글"로 걸러짐
  const perSource = (n: NewsItem) => !!(n.label || n.keepDays);
  const bucket = (n: NewsItem) => (perSource(n) ? `${n.category}:${n.source}` : n.category);
  const limit = (n: NewsItem) => (perSource(n) ? MAX_NEW_PER_BUCKET : (MAX_NEW_BY_SECTION[n.category] ?? MAX_NEW_PER_BUCKET));
  const latest: Record<string, string> = {};
  for (const n of known.values()) {
    const b = bucket(n);
    if (!latest[b] || n.publishedAt > latest[b]) latest[b] = n.publishedAt;
  }
  const taken: Record<string, number> = {};
  const seen = new Set<string>();
  const picked: NewsItem[] = [];
  const stories = new StoryIndex(known.values()); // 제목만 다른 같은 소식 걸러내기
  for (const n of [...fetched].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    const b = bucket(n);
    if (!n.key || !n.link || known.has(n.key) || seen.has(n.key)) continue; // 같은 기사가 여러 키워드에 걸린 경우
    if (latest[b] && n.publishedAt <= latest[b]) continue;
    if (isPhotoOnly(n.title)) continue; // [포토] 기사는 사진 한 장뿐이라 요약할 게 없음
    const same = stories.findSame(n);
    if (same) {
      // 같은 소식: 요약은 안 하고 숨긴 채로 저장 (그래야 다음 수집 때 또 들어오지 않음)
      same.coverage = (same.coverage ?? 1) + 1; // 여러 매체가 다룬 소식 = 큰 소식
      seen.add(n.key);
      picked.push({ ...n, hidden: true, duplicate: true });
      continue;
    }
    if ((taken[b] ?? 0) >= limit(n)) continue;
    taken[b] = (taken[b] ?? 0) + 1;
    seen.add(n.key);
    picked.push(n);
    stories.add(n);
  }
  return picked;
}

async function main() {
  const fixed: FeedSource[] = JSON.parse(await readFile("feeds.json", "utf8"));
  const keywords = await loadKeywords();
  const allSources = [...fixed, ...hotSources(keywords)]; // 고정 키워드 + 요즘 뜨는 키워드(2주짜리)
  const sources = activeSources(keywords, allSources); // 휴면 키워드는 하루 첫 수집 때만
  const prev = await loadPrevious();
  const dup = hideDuplicates([...prev.values()]); // 이미 쌓인 중복도 정리 (처음 한 번 많이 숨겨지고, 이후엔 거의 0)
  if (dup) console.log(`🧹 같은 소식 중복 ${dup}건 숨김`);
  const fetched = (await Promise.all(sources.map(fetchSource))).flat();
  const fresh = pickNew(fetched, prev);

  const items = [...prev.values(), ...fresh]
    .filter((n) => Date.now() - new Date(n.publishedAt).getTime() <= (n.keepDays ?? KEEP_DAYS) * DAY)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  // 지난 보도자료 채우기 (새 기사로 세지 않음 → 알림·커밋 메시지엔 안 들어감)
  items.push(...(await backfillPress(fixed, items)));
  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  report.fetched = fetched.length;
  console.log(`📥 수집 ${fetched.length}건 → 새 기사 ${fresh.length}건 · 보관 ${items.length}건`);

  await fillMissingPdfs(items);
  await fixTitles(items);
  await enrich(items, () => save(items));

  // 숨긴 기사는 빼고, 옮겨진 섹션 기준으로 새 기사 수 계산 (알림·커밋 메시지용)
  for (const n of fresh.filter((n) => !n.hidden)) {
    report.newCount++;
    report.newByCategory[n.category] = (report.newByCategory[n.category] ?? 0) + 1;
  }
  scoreKeywords(keywords, sources, allSources, fetched, items);
  await updateHot(keywords, fixed, items); // 일주일에 한 번, 다음 수집부터 적용
  await saveKeywords(keywords);
  await classifyThemes(items);
  await cleanupGlossary(); // 한 번만
  await updateGlossary(items.filter((n) => !n.hidden));
  await makeConcept(items);
  await makeSpacePhoto();
  await save(items);
  await writeActionsSummary(items.length);
  console.log(`✅ ${items.length}건 저장 (새 기사 ${report.newCount}건)`);
}

main();
