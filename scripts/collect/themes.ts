// 보도자료 주제 붙이기: 주제가 없는 보도자료(예전에 요약된 것)만 제목·주요 내용으로 가볍게 분류
// 새 보도자료는 요약할 때 enrich가 같이 붙이니, 여기선 남은 것만
import { PRESS_LABEL, PRESS_THEMES, type NewsItem } from "./config.ts";
import { callGemini, geminiKey } from "./gemini.ts";
import { chunk, parseJson } from "./util.ts";

const PER_RUN = 400; // 주제 없는 3달치를 한 번에 (40건씩 최대 10번 호출, 분당 한도에 걸리면 알아서 재시도)
const PER_CALL = 40;

export async function classifyThemes(items: NewsItem[]): Promise<void> {
  const apiKey = geminiKey();
  if (!apiKey) return;
  const targets = items.filter((n) => n.label === PRESS_LABEL && !n.hidden && n.summary && !n.theme).slice(0, PER_RUN);
  if (!targets.length) return;

  let done = 0;
  for (const batch of chunk(targets, PER_CALL)) {
    const input = batch.map((n, idx) => ({ idx, title: n.title, points: (n.keyPoints ?? []).slice(0, 3) }));
    const prompt = `금융위원회·금융감독원 보도자료를 주제로 분류해. JSON 배열로만 답해: [{"idx": number, "theme": "주제"}]
주제는 반드시 다음 중 하나를 글자 그대로: ${PRESS_THEMES.join(", ")}
행사·인사·기념식처럼 정책 내용이 없으면 "기타".

${JSON.stringify(input)}`;
    try {
      const out = parseJson<{ idx: number; theme: string }[]>(await callGemini(apiKey, prompt), "[");
      for (const o of out) {
        const n = batch[o.idx];
        if (n && PRESS_THEMES.includes(o.theme)) {
          n.theme = o.theme;
          done++;
        }
      }
    } catch (e) {
      console.warn(`⚠️  보도자료 주제 분류 실패: ${(e as Error).message}`);
    }
  }
  const left = items.filter((n) => n.label === PRESS_LABEL && !n.hidden && n.summary && !n.theme).length;
  console.log(`🏷  보도자료 주제 +${done}건 (남은 것 ${left}건)`);
}
