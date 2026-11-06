// 저장 (news.json + meta.json) · GitHub Actions 요약 카드
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { DATA_DIR, PRESS_LABEL, PRESS_RECENT_DAYS, SECTIONS, report, type NewsItem } from "./config.ts";

export async function save(items: NewsItem[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  // 앱이 처음 여는 news.json은 가볍게: 보도자료는 최근 2주만. 3달치 전체는 press.json (보도자료 탭·검색에서만 받음)
  const recent = Date.now() - PRESS_RECENT_DAYS * 86_400_000;
  const isPress = (n: NewsItem) => n.label === PRESS_LABEL;
  const main = items.filter((n) => !isPress(n) || Date.parse(n.publishedAt) >= recent);
  await writeFile(`${DATA_DIR}/news.json`, JSON.stringify(main, null, 2));
  await writeFile(`${DATA_DIR}/press.json`, JSON.stringify(items.filter(isPress), null, 2));
  // 푸터의 "마지막 수집", 알림·커밋 메시지용
  const meta = { updatedAt: new Date().toISOString(), count: items.length, summarized: items.filter((n) => n.summary).length, ...report };
  await writeFile(`${DATA_DIR}/meta.json`, JSON.stringify(meta, null, 2));
}

export async function writeActionsSummary(total: number): Promise<void> {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const r = report;
  const byCat = SECTIONS.filter((c) => r.newByCategory[c]).map((c) => `${c} ${r.newByCategory[c]}`).join(" · ");
  const lines = [
    "## 📰 뉴스 수집 결과",
    "",
    r.newCount > 0
      ? `**새 기사 ${r.newCount}건** · 이번에 요약 ${r.summarizedNow}건 (본문 확보 ${r.bodyFound}건) · 보관 중 ${total}건`
      : `**새 기사 없음** · 보관 중 ${total}건`,
  ];
  const add = (cond: unknown, text: string) => cond && lines.push("", text);
  add(r.newCount > 0, byCat);
  add(r.concept, `📘 오늘의 개념: **${r.concept}**`);
  add(r.pdfRead, `📄 보도자료 PDF ${r.pdfRead}건 읽음`);
  add(r.spacePhoto, `🌌 오늘의 우주 사진: **${r.spacePhoto}**`);
  add(r.newTerms.length, `📖 용어 사전 +${r.newTerms.length}: ${r.newTerms.join(", ")}`);
  add(r.hidden, `🙈 섹션에 안 맞아서 숨긴 기사 ${r.hidden}건`);
  add(r.moved.length, `↪️ 섹션을 옮긴 기사: ${r.moved.join(", ")}`);
  add(r.llmFailedBatches, `⚠️ 요약 실패한 배치 ${r.llmFailedBatches}개 (다음 수집 때 다시 시도)`);
  add(r.newHot.length, `🔥 새 핫 키워드 (2주간 추가 검색): ${r.newHot.join(", ")}`);
  add(r.keywordsSlept.length, `😴 휴면 들어감 (2주째 0건, 이제 하루 한 번만 확인): ${r.keywordsSlept.join(", ")}`);
  add(r.keywordsWoke.length, `☀️ 휴면에서 깨어남: ${r.keywordsWoke.join(", ")}`);
  if (r.keywords.length) {
    lines.push("", "<details><summary>🔑 키워드 성적표</summary>", "", "| 섹션 | 키워드 | 이번 검색 | 실림 | 숨김 | |", "|---|---|---|---|---|---|");
    for (const k of [...r.keywords].sort((a, b) => SECTIONS.indexOf(a.category) - SECTIONS.indexOf(b.category) || b.kept - a.kept))
      lines.push(`| ${k.category} | ${k.query} | ${k.fetchedNow} | ${k.kept} | ${k.hidden} | ${k.hot ? "🔥" : ""}${k.sleeping ? "😴" : k.dead ? "💤" : ""} |`);
    lines.push("", "</details>");
  }
  if (r.failedFeeds.length) {
    lines.push("", "### ⚠️ 실패한 피드", "", "| 섹션 | 소스 | 이유 |", "|---|---|---|");
    for (const f of r.failedFeeds) lines.push(`| ${f.category} | ${f.source} | ${f.error.replace(/\|/g, "/")} |`);
  }
  await appendFile(file, lines.join("\n") + "\n");
}
