/* 해시 라우팅: #/ , #/section/보도자료?page=2&filter=금융감독원&from=2026-10-01&to=2026-10-15&q=가상자산 , #/article/<id> , #/search?q=금리 */
export type Route =
  | { name: "front" }
  | { name: "section"; section: string; page: number; filter?: string; from?: string; to?: string; q?: string; view?: string }
  | { name: "article"; id: string }
  | { name: "search"; q: string; page: number }
  | { name: "glossary"; term?: string };

export function parseHash(): Route {
  const [path, query = ""] = window.location.hash.split("?");
  const [, kind, raw] = path.split("/");
  const value = raw ? decodeURIComponent(raw) : "";
  const params = new URLSearchParams(query);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const filter = params.get("filter") || undefined;
  if (kind === "section" && value)
    return { name: "section", section: value, page, filter, from: params.get("from") || undefined, to: params.get("to") || undefined, view: params.get("view") || undefined, q: params.get("q") || undefined };
  if (kind === "article" && value) return { name: "article", id: value };
  if (kind === "search") return { name: "search", q: params.get("q") ?? "", page };
  if (kind === "glossary") return { name: "glossary", term: params.get("t") || undefined };
  return { name: "front" };
}

export const href = {
  front: "#/",
  section: (s: string, page = 1, filter?: string, opts: { from?: string; to?: string; q?: string; view?: string } = {}) => {
    const q = new URLSearchParams();
    if (page > 1) q.set("page", String(page));
    if (filter) q.set("filter", filter);
    if (opts.from) q.set("from", opts.from);
    if (opts.to) q.set("to", opts.to);
    if (opts.q) q.set("q", opts.q);
    if (opts.view) q.set("view", opts.view);
    const qs = q.toString();
    return `#/section/${encodeURIComponent(s)}${qs ? `?${qs}` : ""}`;
  },
  article: (id: string) => `#/article/${encodeURIComponent(id)}`,
  glossary: (term?: string) => `#/glossary${term ? `?t=${encodeURIComponent(term)}` : ""}`,
  search: (q = "", page = 1) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return `#/search${qs ? `?${qs}` : ""}`;
  },
};
