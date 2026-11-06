import type { Concept, GlossaryEntry } from "../types/news";

// 표기 비교용: 띄어쓰기·괄호·대소문자 무시 (수집 스크립트와 같은 규칙)
export const termKey = (t: string) => t.toLowerCase().replace(/[\s()[\]·・\-_'"“”‘’]/g, "");

export type TermInfo = GlossaryEntry & { concept?: Concept };

/** 용어 → 사전 항목 (다른 표기로도 찾을 수 있게). 오늘의 개념에서 다룬 용어면 쟁점도 붙임 */
export function buildLookup(entries: GlossaryEntry[], concepts: Concept[]): Map<string, TermInfo> {
  const byTerm = new Map(concepts.map((c) => [termKey(c.term), c]));
  const map = new Map<string, TermInfo>();
  for (const e of entries) {
    const keys = [e.term, ...(e.aliases ?? [])].map(termKey);
    const info: TermInfo = { ...e, concept: keys.map((k) => byTerm.get(k)).find(Boolean) };
    for (const k of keys) if (!map.has(k)) map.set(k, info);
  }
  return map;
}

// 사전 페이지 묶음: 한글은 초성(ㄲ→ㄱ), 영어는 A–Z, 나머지는 #
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const SINGLE: Record<string, string> = { ㄲ: "ㄱ", ㄸ: "ㄷ", ㅃ: "ㅂ", ㅆ: "ㅅ", ㅉ: "ㅈ" };
export function initialOf(term: string): string {
  const c = term.trim()[0] ?? "#";
  const code = c.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const cho = CHO[Math.floor((code - 0xac00) / 588)];
    return SINGLE[cho] ?? cho;
  }
  if (/[a-z]/i.test(c)) return c.toUpperCase();
  return "#";
}

// 초성 검색: "ㄱㅁㄷ" → 공매도. 한글은 글자마다 첫 자음(ㄲ·ㄸ 등은 그대로), 나머지 글자는 그대로
export function chosungOf(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    out += code >= 0xac00 && code <= 0xd7a3 ? CHO[Math.floor((code - 0xac00) / 588)] : ch;
  }
  return out.replace(/\s+/g, "");
}
// 자음만으로 된 검색어인지 (ㄱ~ㅎ)
export const isChosungQuery = (q: string) => /^[ㄱ-ㅎ\s]+$/.test(q) && q.trim().length > 0;
