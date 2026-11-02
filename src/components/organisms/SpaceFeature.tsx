import type { SpacePhoto } from "../../types/news";
import { StoryImage } from "../atoms/StoryImage";

// 메뉴 제목 같은 게 잘못 잡힌 경우 대비
const BAD_TITLE = /suggested searches|featured|keep exploring/i;

// 유튜브·비메오도 mp4처럼 소리 없이 자동·반복 재생되게 주소에 옵션 추가
function autoplayEmbed(url: string): string {
  try {
    const u = new URL(url);
    const yt = u.pathname.match(/\/embed\/([\w-]+)/)?.[1];
    if (/youtube/.test(u.hostname) && yt) {
      for (const [k, v] of Object.entries({
        autoplay: "1",
        mute: "1",
        loop: "1",
        playlist: yt,
        playsinline: "1",
      }))
        u.searchParams.set(k, v);
    } else if (/vimeo/.test(u.hostname)) {
      for (const [k, v] of Object.entries({
        autoplay: "1",
        muted: "1",
        loop: "1",
      }))
        u.searchParams.set(k, v);
    }
    return u.href;
  } catch {
    return url;
  }
}

/** 1면 톱: NASA 오늘의 천문 사진·영상 (꽉 차게 + 원제 + 쉬운 한국어 설명) */
export function SpaceFeature({ photo }: { photo: SpacePhoto }) {
  const title = BAD_TITLE.test(photo.title) ? null : photo.title;
  const isVideo = !!(photo.video || photo.embed);
  return (
    <article>
      {photo.video ? (
        // NASA가 올린 mp4: 소리 없이 반복 재생 (폰에서도 자동재생되려면 muted + playsInline 필요)
        <figure className="mb-4">
          <video
            src={photo.video}
            poster={photo.image}
            autoPlay
            muted
            loop
            playsInline
            controls
            preload="metadata"
            className="aspect-3/2 w-full bg-black object-cover"
          />
          <figcaption className="mt-1 text-right text-[0.7rem] text-muted">
            {photo.credit}
          </figcaption>
        </figure>
      ) : photo.embed ? (
        <figure className="mb-4">
          <iframe
            src={autoplayEmbed(photo.embed)}
            title={photo.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="aspect-video w-full bg-black"
          />
          <figcaption className="mt-1 text-right text-[0.7rem] text-muted">
            {photo.credit}
          </figcaption>
        </figure>
      ) : (
        <a
          href={photo.hdImage ?? photo.image}
          target="_blank"
          rel="noreferrer"
          tabIndex={-1}
          aria-hidden
        >
          <StoryImage
            src={photo.image}
            credit={photo.credit}
            ratio="aspect-[3/2]"
            position="object-center"
            className="mb-4"
            priority
          />
        </a>
      )}
      <p className="flex gap-3 text-xs">
        <span className="font-semibold">
          Today&rsquo;s Space {isVideo ? "Video" : "Photo"}
        </span>
        <span className="text-muted">{photo.date}</span>
      </p>
      {title && (
        <h2 className="mt-2 font-serif text-[clamp(1.6rem,3.2vw,2.4rem)] leading-tight font-bold">
          {title}
        </h2>
      )}
      {photo.story && (
        <p className="mt-4 max-w-[60ch] font-serif text-lg leading-[1.8] text-ink-soft">
          {photo.story}
        </p>
      )}
      <a
        href={photo.link}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block text-sm font-semibold underline underline-offset-4 hover:text-ink-soft"
      >
        View on NASA APOD
      </a>
    </article>
  );
}
