import { Notice } from "./components/atoms/Notice";
import { PageLayout } from "./components/templates/PageLayout";
import { useEffect } from "react";
import { useGlossary } from "./hooks/useGlossary";
import { useNews } from "./hooks/useNews";
import { useRoute } from "./hooks/useRoute";
import { ArticlePage } from "./pages/ArticlePage";
import { FrontPage } from "./pages/FrontPage";
import { GlossaryPage } from "./pages/GlossaryPage";
import { SearchPage } from "./pages/SearchPage";
import { SectionPage } from "./pages/SectionPage";

export default function App() {
  const route = useRoute();
  const { items, allItems, archiveLoaded, loadArchive, error, version, concept, space, refresh } = useNews();
  const { lookup } = useGlossary(version);

  // 보도자료 보관소(3달치)가 필요한 화면: 보도자료 탭, 검색, 용어 사전, news.json에 없는 기사(오래된 보도자료 공유 링크)
  const needsArchive =
    (route.name === "section" && route.section === "보도자료") ||
    route.name === "search" ||
    route.name === "glossary" ||
    (route.name === "article" && !!items && !items.some((n) => n.id === route.id));
  useEffect(() => {
    if (needsArchive && !archiveLoaded) void loadArchive();
  }, [needsArchive, archiveLoaded, loadArchive]);
  const full = allItems ?? items; // 보관소까지 합친 목록 (아직 안 받았으면 기본 목록)

  const activeSection =
    route.name === "section"
      ? route.section
      : route.name === "article"
        ? full?.find((n) => n.id === route.id)?.category
        : undefined;

  return (
    <PageLayout
      activeSection={activeSection}
      isGlossary={route.name === "glossary"}
      isSearch={route.name === "search"}
      items={items}
      version={version}
      onRefresh={refresh}
    >
      {/* 안내는 한 번에 하나만: 전체가 비었으면 여기서만 알려주고 페이지는 안 그림 */}
      {error && <Notice>We couldn&rsquo;t load today&rsquo;s stories. Pull down to try again.</Notice>}
      {!error && items && items.length === 0 && <Notice>No stories yet.</Notice>}

      {items && items.length > 0 && route.name === "front" && (
        <FrontPage items={items} concept={concept} />
      )}
      {items && items.length > 0 && route.name === "section" && (
        <SectionPage
          section={route.section}
          page={route.page}
          filter={route.filter}
          from={route.from}
          to={route.to}
          view={route.view}
          q={route.q}
          items={full!.filter((n) => n.category === route.section)}
          space={route.section === "과학" ? space : null}
        />
      )}
      {items && items.length > 0 && route.name === "search" && (
        <SearchPage q={route.q} page={route.page} items={full!} />
      )}
      {/* 보관소를 받는 중엔 "없는 기사" 안내가 잠깐 뜨지 않게 기다림 */}
      {items && items.length > 0 && route.name === "article" && !(needsArchive && !archiveLoaded) && (
        <ArticlePage
          item={full!.find((n) => n.id === route.id)}
          items={full!}
          lookup={lookup}
        />
      )}
      {items && items.length > 0 && route.name === "glossary" && (
        <GlossaryPage lookup={lookup} items={full!} focus={route.term} />
      )}
    </PageLayout>
  );
}
