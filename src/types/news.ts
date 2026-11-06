export type NewsItem = {
  id: string;
  category: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  snippet: string;
  summary?: string;
  tags?: string[];
  essayPoint?: string;
  spaceFact?: string;
  titleKo?: string;
  hidden?: boolean;
  label?: string; // "보도자료" 등
  attachment?: string; // 보도자료 PDF
  keyPoints?: string[]; // 보도자료 주요 내용
  terms?: string[]; // 용어 풀이 링크를 걸 용어
  coverage?: number; // 같은 소식을 다룬 매체 수
  theme?: string; // 보도자료 주제
  image?: string;
};

export type GlossaryEntry = {
  term: string;
  aliases?: string[];
  definition: string;
  addedAt: string;
};

export type Concept = {
  date: string;
  term: string;
  definition: string;
  issues: string[];
  essayAngle: string;
  relatedIds: string[];
};

export type SpacePhoto = {
  date: string;
  title: string;
  titleKo: string;
  story: string;
  image?: string; // 사진 (영상이면 미리보기 이미지)
  hdImage?: string;
  video?: string; // NASA가 올린 mp4
  embed?: string; // 유튜브·비메오 임베드
  credit: string;
  link: string;
};
