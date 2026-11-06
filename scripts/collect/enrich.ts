// Gemini로 요약 · 섹션 확인 · 논술 포인트
import { BATCH, BODY_CHARS, NEWS_SECTIONS, PRESS_CHARS, PRESS_LABEL, PRESS_THEMES, SUMMARY_VERSION, TERM_SECTIONS, report, type NewsItem } from "./config.ts";
import { readArticle } from "./article.ts";
import { callGemini, geminiKey } from "./gemini.ts";
import { chunk, parseJson, runPool, sleep } from "./util.ts";

export const PROMPT = `다음 뉴스 목록 각각에 대해 JSON 배열로만 답해.
각 원소: {
  "idx": number,
  "fit": "이 기사가 실제로 속하는 섹션 하나 (경제, 정치, IT, 과학, 문화 중). 국제 뉴스는 내용에 따라 경제(금리·환율·무역)·정치(외교·정상회담)로, 사건·사고·사회 이슈는 null. 문화에는 전시·공연·책·영화·드라마가 들어감. 정치에는 여야 공방·국회 대치·대통령실·정당·선거 같은 정치 싸움 기사도 들어감. 정치인이 나와도 연예·사건사고·의료 등 정치 다툼이 핵심이 아닌 기사나 행사·지역 홍보 기사는 null. 검색 키워드가 비유로만 쓰였거나(예: '의료의 블랙홀', '우주 최강') 어느 섹션에도 안 맞으면 null",
  "titleKo": "제목이 한국어가 아니면 자연스러운 한국어 제목, 한국어면 null",
  "summary": "한국어 요약. 보도자료면 무엇을 왜 하는지 딱 1~2문장 (keyPoints와 같은 문장 반복 금지). 그 외엔 body가 있으면 핵심 사실(누가, 무엇을, 왜, 수치)을 담아 3~4문장, body가 null이면 snippet 기준으로 1~2문장",
  "tags": ["키워드", 최대 3개],
  "essayPoint": "경제 기사와 보도자료, 그리고 금융·경제 정책과 직접 연결되는 정치 기사만 (정치 싸움만 있는 기사는 null). 금융감독원 논술 답안에 근거로 쓸 수 있게, 아래 세 줄을 줄바꿈(\\n)으로 나눠서. 각 줄 1~2문장:\\n배경: 이 조치·사건이 왜 지금 나왔는지 (직전 상황, 계기)\\n둘째 줄은 둘 중 하나로 이름을 골라: body·title에 수치·통계·법 조항(예: 피해액, 건수, 비율, 법 이름과 조항)이 있으면 '근거: '로 시작해서 그 숫자·조항을 그대로 인용, 없으면 '대응: '으로 시작해서 당국·기업이 내놓은 조치를 한 문장으로. 숫자가 없는데 근거라고 이름 붙이지 마\\n쟁점: 반대 시각이나 한계, 남은 과제 (찬반이 있으면 양쪽을 함께, 어느 편도 들지 마). '투자자 보호와 시장 신뢰에 기여한다'처럼 어떤 기사에나 붙는 일반론은 쓰지 마. 다른 섹션은 null",
  "spaceFact": "과학만: 이 기사와 연결된, 일반인이 '오 신기하다' 할 만한 과학 지식을 2~3문장으로 쉽게 설명 (기사에 나온 현상·천체·원리가 무엇이고 왜 흥미로운지). 다른 섹션은 null"
}
category는 검색 키워드로 붙은 임시 섹션이라 틀릴 수 있어. essayPoint와 spaceFact는 category가 아니라 fit 기준으로 판단해 (보도자료는 fit과 상관없이 essayPoint를 써).
summary와 essayPoint는 제공된 title, snippet, body에 있는 내용만 근거로 쓰고 지어내지 마. 정치 기사는 사실만 쓰고 평가나 판단을 붙이지 마. 다툼 기사는 양쪽 주장을 함께 담고 한쪽 표현만 키우지 마. 문체는 '~습니다/~입니다'.
label이 "보도자료"면 금융당국이 직접 낸 자료(body는 첨부 PDF 전문일 수 있음)이니, summary는 무엇을 왜 하는지만 1~2문장으로 짧게 쓰고 (세부 수치·일정은 keyPoints에 맡겨서 겹치지 않게),
"keyPoints"에 주요 내용을 3~5개 (각 한 문장, 수치·시행일·대상 포함) 배열로 넣어. 보도자료가 아니면 keyPoints는 null. spaceFact는 널리 확립된 과학 지식만 써.
"theme": label이 "보도자료"면 아래 주제 중 가장 가까운 하나를 그대로: ${PRESS_THEMES.join(", ")}. 행사·인사·기념식처럼 정책 내용이 없으면 "기타". 보도자료가 아니면 null.
"terms": 보도자료·경제·정치만. 일반인이 뜻을 모를 만한 경제·금융·정책 전문 용어 0~3개 (예: DSR, 책무구조도, 공매도, 기준금리, 테이퍼링).
네가 쓴 summary·keyPoints·essayPoint 안에 나온 표기 그대로 적어. 금리·주식·정부처럼 흔한 단어, 기관·사람·회사 이름은 빼. 다른 섹션은 null.`;

type LlmResult = {
  idx: number;
  fit: string | null;
  summary: string;
  tags: string[] | null;
  essayPoint: string | null;
  spaceFact: string | null;
  titleKo: string | null;
  keyPoints: string[] | null;
  terms: string[] | null;
  theme: string | null;
};

function apply(n: NewsItem, o: LlmResult): void {
  // 보도자료는 섹션 고정, 그 외엔 LLM이 고른 섹션으로 (어디에도 안 맞으면 숨김)
  if (n.label !== PRESS_LABEL) {
    if (!o.fit || !NEWS_SECTIONS.includes(o.fit)) {
      n.hidden = true;
      report.hidden++;
      return;
    }
    if (o.fit !== n.category) {
      report.moved.push(`${n.category}→${o.fit}`);
      n.category = o.fit;
    }
  }
  n.summary = o.summary;
  n.sv = SUMMARY_VERSION;
  n.tags = o.tags ?? [];
  if (o.titleKo) n.titleKo = o.titleKo;
  if (o.essayPoint) n.essayPoint = o.essayPoint;
  if (o.spaceFact) n.spaceFact = o.spaceFact;
  if (n.label === PRESS_LABEL && o.keyPoints?.length) n.keyPoints = o.keyPoints.slice(0, 5);
  // 용어는 화면에서 링크를 걸 수 있게, 실제로 글에 나온 것만
  if (n.label === PRESS_LABEL && o.theme && PRESS_THEMES.includes(o.theme)) n.theme = o.theme;
  if (TERM_SECTIONS.includes(n.category) && o.terms?.length) {
    const text = [n.summary, n.essayPoint, ...(n.keyPoints ?? [])].join(" ");
    const terms = [...new Set(o.terms.map((t) => t.trim()))].filter((t) => t.length >= 2 && text.includes(t));
    if (terms.length) n.terms = terms.slice(0, 3);
  }
}

// 요약 안 된 기사만 Gemini로 (BATCH건씩, 2묶음 동시에). 묶음이 끝날 때마다 onProgress로 중간 저장
export async function enrich(items: NewsItem[], onProgress: () => Promise<void>): Promise<void> {
  const apiKey = geminiKey();
  if (!apiKey) {
    console.log("ℹ️  GEMINI_API_KEY 없음 → LLM 요약 건너뜀");
    return;
  }
  // 요약 안 된 기사 + 예전 방식으로 요약된 보도자료 (보관 기간이 길어서 새 방식으로 한 번 다시)
  const todo = items.filter(
    (n) => !n.hidden && (!n.summary || (n.label === PRESS_LABEL && (n.sv ?? 1) < SUMMARY_VERSION)),
  );
  if (todo.length === 0) return;

  const batches = chunk(todo, BATCH);
  let done = 0;
  let saving = Promise.resolve();
  console.log(`⏳ 요약할 기사 ${todo.length}건 (${batches.length}묶음, 2묶음씩 동시에)`);

  await runPool(batches, 2, async (batch) => {
    const bodies = await Promise.all(batch.map(readArticle));
    const gotBody = bodies.filter(Boolean).length;
    const input = batch.map((n, idx) => ({
      idx,
      category: n.category,
      label: n.label ?? null,
      title: n.title,
      snippet: n.snippet,
      body: bodies[idx] ? bodies[idx].slice(0, n.label === PRESS_LABEL ? PRESS_CHARS : BODY_CHARS) : null,
    }));

    try {
      const out = parseJson<LlmResult[]>(await callGemini(apiKey, `${PROMPT}\n\n${JSON.stringify(input)}`), "[");
      for (const o of out) if (batch[o.idx]) apply(batch[o.idx], o);
      report.summarizedNow += batch.filter((n) => n.summary).length;
      report.bodyFound += gotBody;
      done += batch.length;
      console.log(`🤖 요약 ${done}/${todo.length} (본문 확보 ${gotBody}/${batch.length})`);
      saving = saving.then(onProgress); // 중간에 끊겨도 여기까지는 저장 (동시에 안 쓰게 순서대로)
      await saving;
      await sleep(1000);
    } catch (e) {
      report.llmFailedBatches++;
      console.warn(`⚠️  LLM 배치 실패: ${(e as Error).message}`);
    }
  });
}
