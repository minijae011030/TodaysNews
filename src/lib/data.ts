// 데이터 파일 읽기
// - 기본: 봇이 매시간 커밋하는 public/data (main을 pull 받으면 최신)
// - 로컬에서 직접 수집해본 결과(public/data-local)를 보고 싶을 때만: .env에 VITE_LOCAL_DATA=1
//   (예전엔 개발 중이면 무조건 data-local을 먼저 봐서, 오래된 로컬 결과가 최신 데이터를 가렸음)
export function fetchData(name: string): Promise<Response> {
  const base = import.meta.env.BASE_URL;
  const init: RequestInit = { cache: "no-store" }; // 새로고침 때 항상 최신으로
  const shared = () => fetch(`${base}data/${name}`, init);
  if (!(import.meta.env.DEV && import.meta.env.VITE_LOCAL_DATA)) return shared();
  return fetch(`${base}data-local/${name}`, init)
    .then((r) => (r.ok && r.headers.get("content-type")?.includes("json") ? r : shared()))
    .catch(shared);
}
