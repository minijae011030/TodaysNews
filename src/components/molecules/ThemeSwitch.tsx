import { useTheme, type Theme } from "../../hooks/useTheme";

const OPTIONS: { key: Theme; name: string }[] = [
  { key: "auto", name: "Auto" },
  { key: "light", name: "Light" },
  { key: "dark", name: "Dark" },
];

/** 푸터의 화면 테마 고르기 */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <h2 className="font-semibold text-ink">Appearance</h2>
      <div role="radiogroup" aria-label="Appearance" className="mt-3 inline-flex border border-ink">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={theme === o.key}
            onClick={() => setTheme(o.key)}
            className={`px-3.5 py-1.5 text-sm ${theme === o.key ? "bg-ink font-semibold text-paper" : "text-ink-soft hover:text-ink"}`}
          >
            {o.name}
          </button>
        ))}
      </div>
    </div>
  );
}
