import type { ReactNode } from "react";
import type { NewsItem } from "../../types/news";
import { AppPrompt } from "../organisms/AppPrompt";
import { BottomNav } from "../organisms/BottomNav";
import { CompactHeader } from "../organisms/CompactHeader";
import { Footer } from "../organisms/Footer";
import { Masthead } from "../organisms/Masthead";
import { PullToRefresh } from "../organisms/PullToRefresh";

/** 모든 페이지 공통 틀: 당겨서 새로고침 + 제호 + 본문 + 푸터 + 하단 안내 시트 */
export function PageLayout({
  activeSection,
  isGlossary = false,
  isSearch = false,
  items,
  version,
  onRefresh,
  children,
}: {
  activeSection?: string;
  isGlossary?: boolean;
  isSearch?: boolean;
  items: NewsItem[] | null;
  version: number;
  onRefresh: () => Promise<number | null>;
  children: ReactNode;
}) {
  return (
    <>
    <PullToRefresh onRefresh={onRefresh}>
      <div className="mx-auto max-w-300 px-4 pb-24 sm:px-6">
        <Masthead active={activeSection} isGlossary={isGlossary} hideSections={isSearch || isGlossary} />
        {children}
        <Footer items={items} version={version} />
      </div>
    </PullToRefresh>
    {/* 당겨서 새로고침이 움직이는 영역 밖에 둬야 화면에 고정됨 */}
    <CompactHeader />
    {/* 섹션·기사도 "뉴스 보기"라 1면 탭 */}
    <BottomNav current={isSearch ? "search" : isGlossary ? "glossary" : "front"} />
    <AppPrompt />
    </>
  );
}
