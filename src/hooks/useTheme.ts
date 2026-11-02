import { useCallback, useEffect, useState } from "react";

export type Theme = "auto" | "light" | "dark";

const read = (): Theme => {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
};

/** 화면 테마: Auto(기기 설정) · Light · Dark. 고른 건 이 기기에 저장 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(read);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      if (theme === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", theme);
    } catch {}

    // 폰 상단 상태표시줄 색도 맞춤 (Auto면 기기 설정이 바뀔 때도 따라감)
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "auto" && mq.matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#121212" : "#ffffff");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  return { theme, setTheme };
}
