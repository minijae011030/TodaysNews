import { useUpdatedAt } from "../../hooks/useUpdatedAt";
import { REPO_URL, SECTIONS } from "../../lib/constants";
import { fullDate, stamp } from "../../lib/format";
import { href } from "../../lib/route";
import type { NewsItem } from "../../types/news";
import { GithubIcon } from "../atoms/GithubIcon";
import { NotifyButton } from "../molecules/NotifyButton";
import { ThemeSwitch } from "../molecules/ThemeSwitch";
import { StatRow } from "../molecules/StatRow";

export function Footer({
  items,
  version,
}: {
  items: NewsItem[] | null;
  version: number;
}) {
  const updatedAt = useUpdatedAt(version);
  const summarized = items?.filter((n) => n.summary).length ?? 0;

  return (
    <footer className="mt-24 border-t-4 border-double border-ink pt-8 text-sm text-ink-soft">
      <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <a
            href={href.front}
            className="font-masthead text-3xl font-black text-ink"
          >
            Today&rsquo;s News
          </a>
          <p className="mt-3 max-w-[42ch] font-serif leading-[1.75]">
            금감원·금융위 보도자료와 경제·정치·IT·과학·문화 뉴스를 매시간 모아
            요약합니다.
          </p>
        </div>

        <nav aria-label="Sections">
          <h2 className="font-semibold text-ink">Sections</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
            <li>
              <a href={href.front} className="hover:text-ink hover:underline">
                1면
              </a>
            </li>
            {SECTIONS.map((s) => (
              <li key={s}>
                <a
                  href={href.section(s)}
                  className="hover:text-ink hover:underline"
                >
                  {s}
                </a>
              </li>
            ))}
            <li>
              <a href={href.glossary()} className="hover:text-ink hover:underline">
                용어 사전
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="font-semibold text-ink">This Edition</h2>
          <dl className="mt-3 space-y-2">
            {updatedAt && (
              <StatRow label="Last updated">
                {stamp.format(new Date(updatedAt))}
              </StatRow>
            )}
            {items && (
              <>
                <StatRow label="Stories">{items.length}</StatRow>
                <StatRow label="Summarized">{summarized}</StatRow>
              </>
            )}
            <StatRow label="Archive">3 days</StatRow>
          </dl>
          <NotifyButton />
          <div className="mt-6">
            <ThemeSwitch />
          </div>
        </div>
      </div>

      <div className="mt-10 border-t border-rule pt-5 text-xs leading-[1.8] text-muted">
        <p>
          Stories are sourced from Naver News, NASA and individual publishers. Summaries and talking
          points are written by AI from the original reporting and may contain errors, so check the
          original for anything important. All articles remain the property of their publishers.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span>{fullDate.format(new Date())}</span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-ink-soft hover:text-ink hover:underline"
          >
            <GithubIcon />
            minijae011030/TodaysNews
          </a>
        </div>
      </div>
    </footer>
  );
}
