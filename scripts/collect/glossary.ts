// 용어 사전 (glossary.json)
// - 새 용어: 기사 2건 이상에 나온 용어 중 사전에 없는 것만 Gemini로 정의 (한 번에 최대 MAX_NEW_TERMS개)
// - 대청소(한 번만): 공부에 안 쓰일 용어 빼기 + 같은 뜻 합치기 + 중요도(필수/알면 좋음/참고) 매기기
import { mkdir, writeFile } from "node:fs/promises";
import { DATA_DIR, MAX_NEW_TERMS, report, type NewsItem } from "./config.ts";
import { callGemini, geminiKey } from "./gemini.ts";
import { chunk, kstToday, parseJson, readData } from "./util.ts";

export type GlossaryEntry = {
  term: string; // 대표 표기
  aliases?: string[]; // 다른 표기 (예: 총부채원리금상환비율 ↔ DSR)
  definition: string;
  addedAt: string;
  level?: 1 | 2 | 3; // 1 필수 · 2 알면 좋음 · 3 참고
};

const MIN_MENTIONS = 2; // 기사 몇 건 이상에 나와야 사전에 넣을지 (한 번 스친 용어는 기다림)
const CLEANUP_VERSION = 2; // 대청소 기준이 바뀌면 올려서 한 번 더 (2: 뺀 용어를 기억하도록 바꾸면서 한 번 더)

// 표기 비교용: 띄어쓰기·괄호·대소문자 무시
export const termKey = (t: string) => t.toLowerCase().replace(/[\s()\[\]·・\-_'"“”‘’]/g, "");

const AUDIENCE = "금융감독원·금융공기업 논술과 면접을 준비하는 사람";
const LEVEL_RULE = `"level": 1 = 필수 (금융감독·금융정책·자본시장·거시경제 핵심 개념, 면접·논술에 자주 나옴), 2 = 알면 좋음 (관련은 있지만 덜 핵심), 3 = 참고 (시장 용어·일반 경제 용어)`;

const save = async (list: GlossaryEntry[]) => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(`${DATA_DIR}/glossary.json`, JSON.stringify(list, null, 2));
};

export async function updateGlossary(items: NewsItem[]): Promise<void> {
  const apiKey = geminiKey();
  if (!apiKey) return;
  const glossary = (await readData<GlossaryEntry[]>("glossary.json")) ?? [];
  const known = new Set(glossary.flatMap((e) => [e.term, ...(e.aliases ?? [])].map(termKey)));
  // 대청소나 정의 단계에서 뺀 용어는 다시 안 넣음 (안 그러면 다음 수집 때 바로 또 들어옴)
  const state = (await readData<{ glossaryRejected?: string[] }>("state.json")) ?? {};
  const rejected = new Set(state.glossaryRejected ?? []);

  // 사전에 없는 용어 중 기사 MIN_MENTIONS건 이상에 나온 것 (자주 나온 것부터)
  const count = new Map<string, { t: string; n: number }>();
  for (const n of items)
    for (const t of new Set(n.terms ?? [])) {
      const k = termKey(t);
      if (known.has(k) || rejected.has(k)) continue;
      count.set(k, { t: count.get(k)?.t ?? t, n: (count.get(k)?.n ?? 0) + 1 });
    }
  const missing = [...count.values()]
    .filter((c) => c.n >= MIN_MENTIONS)
    .sort((a, b) => b.n - a.n)
    .map((c) => c.t)
    .slice(0, MAX_NEW_TERMS);
  if (missing.length === 0) return;

  const prompt = `${AUDIENCE}을 위한 경제·금융 용어 사전을 만들고 있어. 아래 용어 각각을 JSON 배열로만 답해.
각 원소: {
  "term": "주어진 표기 그대로",
  "aliases": ["같은 뜻의 다른 표기 (약어↔정식 명칭 등), 없으면 빈 배열"],
  "definition": "무엇인지 1~2문장. 교과서적으로 정확하게, 널리 확립된 내용만. 특정 기사 내용이나 최근 수치는 넣지 마. 문체는 '~입니다/~합니다'",
  ${LEVEL_RULE}
}
금융·경제·정책 전문 용어만. 일반 명사(배달비, 대기발령 등), 다른 업계 용어(의료·제조·IT 제품명 등), 회사·기관·사람 이름은 그 원소를 빼.
철자가 틀린 용어(예: "실실적배당형"처럼 글자가 겹치거나 빠진 것)도 고치지 말고 빼.

용어: ${JSON.stringify(missing)}`;

  try {
    const out = parseJson<{ term: string; aliases?: string[]; definition: string; level?: number }[]>(
      await callGemini(apiKey, prompt),
      "[",
    );
    const today = kstToday();
    const added: GlossaryEntry[] = [];
    for (const o of out) {
      if (!o.term || !o.definition || known.has(termKey(o.term))) continue;
      // 다른 표기가 이미 사전의 다른 용어면 버림 (예: 가계대출의 다른 표기로 "가계부채"가 오면 둘은 다른 개념)
      const aliases = (o.aliases ?? [])
        .map(String)
        .filter((a) => a && termKey(a) !== termKey(o.term) && !known.has(termKey(a)))
        .slice(0, 4);
      const level = ([1, 2, 3] as const).find((l) => l === Number(o.level)) ?? 2;
      added.push({ term: o.term, ...(aliases.length ? { aliases } : {}), definition: o.definition, addedAt: today, level });
      for (const k of [o.term, ...aliases]) known.add(termKey(k));
    }
    // Gemini가 정의를 안 준 용어 = 사전감이 아니라고 본 것 → 거절 목록에
    const got = new Set(added.flatMap((e) => [e.term, ...(e.aliases ?? [])].map(termKey)));
    const newlyRejected = missing.map(termKey).filter((k) => !got.has(k));
    if (newlyRejected.length) await rememberRejected(newlyRejected);
    if (added.length === 0) return;
    const next = [...glossary, ...added].sort((a, b) => a.term.localeCompare(b.term, "ko"));
    await save(next);
    report.newTerms = added.map((e) => e.term);
    console.log(`📖 용어 사전 +${added.length} (총 ${next.length}): ${report.newTerms.join(", ")}`);
  } catch (e) {
    console.warn(`⚠️  용어 사전 실패: ${(e as Error).message}`);
  }
}

/** 대청소: 한 번만 (state.json에 버전 기록). 실패하면 다음 수집 때 다시 */
export async function cleanupGlossary(): Promise<void> {
  const apiKey = geminiKey();
  if (!apiKey) return;
  const state = (await readData<Record<string, unknown>>("state.json")) ?? {};
  if (state.glossaryCleanup === CLEANUP_VERSION) return;
  let list = (await readData<GlossaryEntry[]>("glossary.json")) ?? [];
  if (list.length === 0) return;
  const before = list.length;

  try {
    // 1) 같은 뜻 합치기: 이름만 한 번에 보여줘야 서로 멀리 떨어진 표기(FDS ↔ 이상거래탐지)도 찾음
    const names = list.map((e) => e.term);
    const groups = parseJson<{ main: string; same: string[] }[]>(
      await callGemini(
        apiKey,
        `경제·금융 용어 목록이야. 사실상 같은 뜻인 용어끼리 묶어서 JSON 배열로만 답해: [{"main": "대표로 남길 용어", "same": ["합칠 용어", ...]}]
- 약어와 정식 명칭(FDS ↔ 이상거래탐지), 조금 다른 표기(의무공개매수 ↔ 의무공개매수제, 국채 금리 ↔ 국고채 금리)만 묶어
- 관련은 있지만 다른 개념(공매도 ↔ 무차입 공매도, 소비자물가 ↔ 근원물가)은 묶지 마
- 묶을 게 없는 용어는 빼. 대표는 가장 널리 쓰는 정식 표기로. 용어는 목록에 있는 글자 그대로만

${JSON.stringify(names)}`,
      ),
      "[",
    );
    const byKey = new Map(list.map((e) => [termKey(e.term), e]));
    let merged = 0;
    for (const g of groups) {
      const main = byKey.get(termKey(g.main ?? ""));
      if (!main) continue;
      for (const s of g.same ?? []) {
        const other = byKey.get(termKey(s));
        if (!other || other === main || !looksSame(main.term, other.term)) continue;
        const aliases = new Set([...(main.aliases ?? []), other.term, ...(other.aliases ?? [])]);
        aliases.delete(main.term);
        main.aliases = [...aliases].slice(0, 8);
        byKey.delete(termKey(other.term));
        merged++;
      }
    }
    list = [...byKey.values()];
    merged += tidyAliases(list);

    // 2) 빼기 + 중요도: 100개씩
    const verdict = new Map<string, { keep: boolean; level: 1 | 2 | 3 }>();
    for (const batch of chunk(list, 100)) {
      const out = parseJson<{ term: string; keep: boolean; level?: number }[]>(
        await callGemini(
          apiKey,
          `${AUDIENCE}이 쓰는 용어 사전을 정리하고 있어. 각 용어를 JSON 배열로만 판단해: [{"term": "그대로", "keep": true/false, "level": 1|2|3}]
- keep=false: 공부에 쓸 일 없는 것. 일반 명사(배달비, 대기발령), 다른 업계·기술 용어(면역글로불린, 체외충격파, 윤활기유, 그룹웨어), 시험·채용 절차(필기전형), 회사·기관 이름
- keep=true: 금융·경제·정책·제도 용어 (금융 쪽에서 쓰는 IT·보안 용어도 포함: 망분리, FDS, 스미싱 등)
- ${LEVEL_RULE}

${JSON.stringify(batch.map((e) => ({ term: e.term, def: e.definition.slice(0, 60) })))}`,
        ),
        "[",
      );
      for (const o of out) {
        const level = ([1, 2, 3] as const).find((l) => l === Number(o.level)) ?? 2;
        verdict.set(termKey(o.term ?? ""), { keep: o.keep !== false, level });
      }
    }
    // 판단이 안 온 건 남겨둠 (빼는 건 확실할 때만)
    const kept = list
      .filter((e) => verdict.get(termKey(e.term))?.keep !== false)
      .map((e) => ({ ...e, level: verdict.get(termKey(e.term))?.level ?? e.level ?? 2 }));
    const dropped = list.filter((e) => verdict.get(termKey(e.term))?.keep === false).map((e) => e.term);

    await save(kept.sort((a, b) => a.term.localeCompare(b.term, "ko")));
    await writeFile(`${DATA_DIR}/state.json`, JSON.stringify({ ...state, glossaryCleanup: CLEANUP_VERSION }, null, 2));
    await rememberRejected(dropped.map(termKey));
    const lv = [1, 2, 3].map((l) => kept.filter((e) => e.level === l).length);
    console.log(
      `🧽 용어 사전 대청소: ${before} → ${kept.length} (합침 ${merged}, 뺌 ${dropped.length}) · 필수 ${lv[0]} / 알면 좋음 ${lv[1]} / 참고 ${lv[2]}`,
    );
    if (dropped.length) console.log(`   뺀 용어: ${dropped.join(", ")}`);
  } catch (e) {
    console.warn(`⚠️  용어 사전 대청소 실패 (다음 수집 때 다시): ${(e as Error).message}`);
  }
}

/**
 * 다른 표기 정리 (규칙으로, Gemini 없이)
 *  1) 다른 표기가 사전의 다른 용어 이름이면 그 표기를 뺌 (가계대출 ↔ 가계부채처럼 다른 개념끼리 엉키지 않게)
 *  2) 남은 다른 표기가 겹치는 용어끼리는 같은 용어로 합침 (고객확인 의무 · 고객확인(KYC) → 둘 다 "KYC")
 * 합친 개수를 돌려줌. list는 그 자리에서 고침
 */
function tidyAliases(list: GlossaryEntry[]): number {
  const mains = new Set(list.map((e) => termKey(e.term)));
  for (const e of list) e.aliases = (e.aliases ?? []).filter((a) => !mains.has(termKey(a)));

  const owner = new Map<string, GlossaryEntry>();
  const gone = new Set<GlossaryEntry>();
  let merged = 0;
  for (const e of list) {
    const into = (e.aliases ?? []).map((a) => owner.get(termKey(a))).find((x) => x && !gone.has(x));
    if (into && into !== e && !looksSame(into.term, e.term)) {
      // 다른 표기만 겹치고 이름은 다른 개념(가계대출 · 가계부채 ← 둘 다 "가계신용")이면 합치지 말고 겹치는 표기만 뺌
      e.aliases = (e.aliases ?? []).filter((a) => !owner.has(termKey(a)));
    } else if (into && into !== e) {
      const aliases = new Set([...(into.aliases ?? []), e.term, ...(e.aliases ?? [])]);
      aliases.delete(into.term);
      into.aliases = [...aliases].slice(0, 8);
      if ((e.level ?? 9) < (into.level ?? 9)) into.level = e.level;
      gone.add(e);
      merged++;
      for (const a of into.aliases) owner.set(termKey(a), into);
      continue;
    }
    for (const a of e.aliases ?? []) if (!owner.has(termKey(a))) owner.set(termKey(a), e);
  }
  const keep = list.filter((e) => !gone.has(e));
  list.length = 0;
  list.push(...keep);
  for (const e of list) if (e.aliases && !e.aliases.length) delete e.aliases;
  return merged;
}

/**
 * Gemini가 "같은 뜻"이라고 묶어도, 이름이 너무 다르면 안 합침 (가계대출 ↔ 가계부채 같은 실수 방지)
 * 합쳐도 되는 경우: 한쪽이 영문 약어(FDS, KYC) · 한쪽이 다른 쪽을 포함(의무공개매수 ↔ 의무공개매수제) · 글자 조각이 절반 이상 겹침(국채 금리 ↔ 국고채 금리)
 */
function looksSame(a: string, b: string): boolean {
  const ka = termKey(a);
  const kb = termKey(b);
  if (/^[a-z0-9&+]{2,8}$/.test(ka) || /^[a-z0-9&+]{2,8}$/.test(kb)) return true;
  if (ka.includes(kb) || kb.includes(ka)) return true;
  const grams = (k: string) => new Set([...k].slice(0, -1).map((c, i) => c + k[i + 1]));
  const ga = grams(ka);
  const gb = grams(kb);
  let same = 0;
  for (const g of ga) if (gb.has(g)) same++;
  return (2 * same) / (ga.size + gb.size || 1) >= 0.5;
}

/** 사전에서 뺀 용어 기억 (state.json의 glossaryRejected). 최근 2000개만 */
async function rememberRejected(keys: string[]): Promise<void> {
  const state = (await readData<Record<string, unknown> & { glossaryRejected?: string[] }>("state.json")) ?? {};
  const list = [...new Set([...(state.glossaryRejected ?? []), ...keys])].slice(-2000);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(`${DATA_DIR}/state.json`, JSON.stringify({ ...state, glossaryRejected: list }, null, 2));
}
