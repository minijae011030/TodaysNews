// 보도자료 주간 한 줄 (press-weekly.json): "흐름" 보기에서 주마다 그 주 당국이 무엇에 집중했는지 한 줄로
// - 주는 월요일 시작 (KST). 지난 주는 한 번 만들면 끝, 이번 주는 하루 한 번만 다시 (보도자료가 늘었을 때)
// - 빠진 주를 한 번에 모아서 Gemini 1번 호출
import { mkdir, writeFile } from "node:fs/promises";
import { DATA_DIR, PRESS_LABEL, PRESS_KEEP_DAYS, type NewsItem } from "./config.ts";
import { callGemini, geminiKey } from "./gemini.ts";
import { kstToday, parseJson, readData } from "./util.ts";

type Week = { summary: string; count: number; updatedOn: string };
type WeeklyFile = { weeks: Record<string, Week> };

// 그 날짜가 속한 주의 월요일 (YYYY-MM-DD, KST)
export function weekOf(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3600_000);
  const dow = (d.getUTCDay() + 6) % 7; // 월=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export async function updatePressWeekly(items: NewsItem[]): Promise<void> {
  const apiKey = geminiKey();
  if (!apiKey) return;
  const file = (await readData<WeeklyFile>("press-weekly.json")) ?? { weeks: {} };
  const today = kstToday();
  const thisWeek = weekOf(new Date().toISOString());

  const byWeek = new Map<string, NewsItem[]>();
  for (const n of items) {
    if (n.label !== PRESS_LABEL || n.hidden || !n.summary) continue;
    const w = weekOf(n.publishedAt);
    byWeek.set(w, [...(byWeek.get(w) ?? []), n]);
  }

  const todo = [...byWeek.entries()].filter(([w, list]) => {
    const have = file.weeks[w];
    if (!have) return true;
    if (w === thisWeek) return have.count !== list.length && have.updatedOn !== today; // 이번 주: 늘었으면 하루 한 번
    return have.count < list.length; // 지난 주인데 나중에 채워진 글이 있으면 (지난 보도자료 채우기)
  });
  if (todo.length === 0) return;

  const input = todo.map(([w, list]) => ({
    week: w,
    releases: list.map((n) => `[${n.source === "금융감독원" ? "금감원" : "금융위"}${n.theme ? `/${n.theme}` : ""}] ${n.title}`).slice(0, 40),
  }));
  const prompt = `금융위원회·금융감독원의 주간 보도자료 목록이야. 주마다 그 주 금융당국이 무엇에 집중했는지 한국어 한 문장(40자 안팎)으로 요약해서 JSON 객체로만 답해: {"주의 월요일 날짜": "요약", ...}
- 행사·인사·기념식은 빼고 정책·감독 내용 중심으로, 가장 비중 큰 2~3가지 주제를 담아
- 예: "가상자산 해킹 긴급 대응과 미공개정보 이용 제재"
- 평가나 의견은 넣지 마. 문장 끝은 명사형으로

${JSON.stringify(input)}`;

  try {
    const out = parseJson<Record<string, string>>(await callGemini(apiKey, prompt), "{");
    let n = 0;
    for (const [w, list] of todo) {
      const s = out[w];
      if (!s) continue;
      file.weeks[w] = { summary: String(s).trim(), count: list.length, updatedOn: today };
      n++;
    }
    // 보관 기간 지난 주는 정리
    const oldest = weekOf(new Date(Date.now() - PRESS_KEEP_DAYS * 86_400_000).toISOString());
    for (const w of Object.keys(file.weeks)) if (w < oldest) delete file.weeks[w];
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(`${DATA_DIR}/press-weekly.json`, JSON.stringify(file, null, 2));
    console.log(`🗓  보도자료 주간 한 줄 +${n}주`);
  } catch (e) {
    console.warn(`⚠️  보도자료 주간 한 줄 실패: ${(e as Error).message}`);
  }
}
