// 수집 설정 · 공통 타입 · 실행 기록

// 로컬에서는 .env 자동 로드 (Actions에는 파일이 없으니 그냥 넘어감)
try {
  process.loadEnvFile();
} catch {}

export type FeedSource = { category: string; keepDays?: number; label?: string } & (
  | { type: "rss"; url: string }
  | { type: "naver"; query: string; allPress?: boolean } // 기본은 주요 언론사 기사만, allPress면 모든 매체
  | { type: "board"; url: string; source: string; pageParam?: string } // RSS 없는 게시판 (금감원·금융위 보도자료). pageParam: 목록 페이지 번호 이름
);

export type NewsItem = {
  id: string; // URL용 짧은 ID (key의 해시)
  key: string; // 중복 판별용 (정규화한 제목)
  category: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  snippet: string;
  label?: string; // "보도자료"처럼 기사와 구분할 라벨
  keepDays?: number; // 뜸하게 올라오는 소스는 더 오래 보관
  image?: string; // 대표 사진 (og:image 또는 RSS 첨부 이미지)
  attachment?: string; // 보도자료 PDF 주소
  titleTried?: boolean; // 원문에서 제목·사진을 이미 읽었는지
  titleFix?: number; // 잘린 제목 복원 방식 버전 (방식이 바뀌면 예전 기사도 한 번 다시 시도)
  sv?: number; // 요약 방식 버전 (프롬프트를 크게 바꾸면 올려서 보도자료를 다시 요약)
  hidden?: boolean; // 어느 섹션에도 안 맞음 → 화면에서 숨김 (다시 수집·요약하지 않으려고 데이터엔 남겨둠)
  // LLM이 채우는 필드
  summary?: string;
  tags?: string[];
  titleKo?: string; // 영어 기사면 한국어 제목
  essayPoint?: string; // 경제·정치·보도자료: 논술 포인트
  spaceFact?: string; // 과학: 알고 보면 재밌는 과학 지식 (예전 이름 그대로 씀)
  keyPoints?: string[]; // 보도자료 주요 내용
  terms?: string[]; // 용어 풀이할 전문 용어 (보도자료·경제·정치)
  via?: string; // 어느 검색어로 들어왔는지 (키워드 성적표용)
  theme?: string; // 보도자료 주제 (PRESS_THEMES 중 하나)
  coverage?: number; // 같은 소식을 다룬 매체 수 (중복으로 걸러진 기사 포함)
  duplicate?: boolean; // 다른 기사와 같은 소식이라 숨김
};

export const PRESS_LABEL = "보도자료";
// 보도자료 주제: 보도자료 탭 "주제별" 보기용. 이름을 바꾸면 화면(src/lib/constants.ts)도 같이
export const PRESS_THEMES = [
  "소비자보호·분쟁",
  "불공정거래·자본시장",
  "가계부채·부동산금융",
  "가상자산·디지털금융",
  "보안·전산사고",
  "건전성·리스크관리",
  "지배구조·내부통제",
  "포용금융·서민금융",
  "보험",
  "회계·공시",
  "제재·검사",
  "거시·통화·외환",
  "기후·ESG",
  "기타",
];
export const PRESS_KEEP_DAYS = 90; // 보도자료 보관 기간 (지난 글 채우기도 이 기간만큼). 논술·면접 준비용으로 한 분기
export const PRESS_RECENT_DAYS = 14; // news.json에 같이 넣는 최근 보도자료 (나머지는 press.json 보관소 → 앱이 필요할 때만 받음)
export const PRESS_BACKFILL_PER_RUN = 40; // 지난 보도자료를 한 번 수집에 최대 몇 건씩 채울지 (Gemini 한도 고려)
export const SUMMARY_VERSION = 2; // 2: 보도자료 요약 짧게 + 논점 배경/근거·대응/쟁점 + 용어 // 금감원·금융위 보도자료: 섹션 이름이자 라벨
export const NEWS_SECTIONS = ["경제", "정치", "IT", "과학", "문화"]; // LLM이 기사를 나눌 섹션
export const SECTIONS = [PRESS_LABEL, ...NEWS_SECTIONS]; // 화면·요약 카드 순서
export const TERM_SECTIONS = [PRESS_LABEL, "경제", "정치"]; // 용어 풀이를 하는 섹션
export const MAX_NEW_TERMS = 20; // 한 번 수집에 새로 정의할 용어 최대 수 (토큰 절약)

// 섹션 개편 정리: 예전 섹션 이름 → 새 섹션, 없앤 섹션
// (main 데이터가 한 번 정리되고 3일 지나면 지워도 됨)
export const MIGRATE: Record<string, string> = { 국제: "경제", 우주: "과학", 예술: "문화", 책: "문화", 엔터: "문화" };
export const DROPPED = new Set(["사회"]);

// 공식 데이터(public/data)는 Actions 봇만 커밋하고, 로컬 결과는 git에 안 올라가는 public/data-local에 저장
export const DATA_DIR = process.env.CI ? "public/data" : "public/data-local";
export const SHARED_DIR = "public/data"; // 로컬 첫 실행 때 봇이 만든 결과를 재사용

export const KEEP_DAYS = 3;
export const MAX_PER_FEED = 7; // 키워드/피드당 최신 몇 건만
export const MAX_NEW_PER_BUCKET = 6; // 한 번 수집에 섹션(보도자료·블로그는 소스)당 새 글 최대 수
// 섹션별로 다르게: 공부용인 경제는 넉넉히, 취미인 과학·문화는 조금만 (전체 Gemini 사용량은 오히려 줄어듦)
export const MAX_NEW_BY_SECTION: Record<string, number> = { 경제: 10, 과학: 2, 문화: 2 };
export const BATCH = 8; // Gemini 한 번에 넘길 기사 수
export const BODY_CHARS = 1200; // LLM에 넘길 본문 길이 (리드 몇 문단이면 요약엔 충분)
export const PRESS_CHARS = 6000; // 보도자료 PDF는 핵심이 본문이라 더 길게
export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

// 실행 결과 (meta.json + GitHub Actions 요약 카드용)
export const report = {
  fetched: 0,
  newCount: 0, // 이번에 새로 실린 기사 수 (알림·커밋 메시지용)
  newByCategory: {} as Record<string, number>,
  summarizedNow: 0,
  bodyFound: 0,
  pdfRead: 0,
  hidden: 0,
  moved: [] as string[], // 섹션을 옮긴 기사 (예: "정치→경제")
  llmFailedBatches: 0,
  failedFeeds: [] as { category: string; source: string; error: string }[],
  concept: null as string | null,
  spacePhoto: null as string | null,
  newTerms: [] as string[], // 이번에 사전에 추가된 용어
  keywords: [] as KeywordRow[], // 키워드 성적표
  newHot: [] as string[], // 이번에 새로 잡힌 핫 키워드
};

export type KeywordRow = {
  category: string;
  query: string;
  hot: boolean; // 자동으로 잡은 핫 키워드인지
  fetchedNow: number; // 이번 수집에서 검색된 수
  kept: number; // 보관 중 기사 중 섹션에 실린 수
  hidden: number; // 보관 중 기사 중 섹션에 안 맞아 숨긴 수
  dead: boolean; // 며칠째 실린 기사가 없음
};
