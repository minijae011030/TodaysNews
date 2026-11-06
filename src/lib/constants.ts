export const PRESS = "보도자료"; // 금감원·금융위 보도자료 탭

// 보도자료 주제 (수집 스크립트 scripts/collect/config.ts의 PRESS_THEMES와 같게)
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
export const SECTIONS = [PRESS, "경제", "정치", "IT", "과학", "문화"] as const;

// 보도자료 기관 줄임말 (라벨·필터용)
export const AGENCY_SHORT: Record<string, string> = { 금융감독원: "금감원", 금융위원회: "금융위" };

export const PAGE_SIZE = 10;

// 언론사·블로그 기사 사진을 보여줄지 (여러 사람에게 공개하는 사이트라 저작권 때문에 끔. 보도자료·NASA는 그대로)
export const SHOW_NEWS_PHOTOS = false;

export const REPO_URL = "https://github.com/minijae011030/TodaysNews";
