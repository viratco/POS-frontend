// The colour themes a café can pick under Settings. Colours live in app/themes.css
// (scripts/themes.mjs); this is their names and the printed QR card colours.
export type ThemeKey = "classic" | "matcha" | "strawberry" | "blueberry" | "mango" | "ocean";

export const THEMES: { key: ThemeKey; name: string; note: string; qr: { from: string; mid: string; to: string; soft: string } }[] = [
  { key: "classic", name: "Classic Café", note: "Warm cream and espresso", qr: { from: "#2a5f3a", mid: "#1d4a2b", to: "#163a21", soft: "#c9e8a8" } },
  { key: "matcha", name: "Matcha Garden", note: "Fresh and calm green", qr: { from: "#4f7a2f", mid: "#3b6122", to: "#294817", soft: "#dff3b8" } },
  { key: "strawberry", name: "Strawberry Milk", note: "Soft, sweet pink", qr: { from: "#c2476f", mid: "#a5325a", to: "#7f2344", soft: "#ffd9e4" } },
  { key: "blueberry", name: "Blueberry Bliss", note: "Dreamy lavender", qr: { from: "#5b4fb0", mid: "#463a96", to: "#322875", soft: "#dcd6ff" } },
  { key: "mango", name: "Mango Sunrise", note: "Sunny peach and orange", qr: { from: "#c96a1a", mid: "#ab5410", to: "#863f0a", soft: "#ffe3b8" } },
  { key: "ocean", name: "Ocean Mint", note: "Cool, clean teal", qr: { from: "#0f7a86", mid: "#0b626d", to: "#074a53", soft: "#c7f3ee" } },
];

export function themeOf(key: string | null | undefined) {
  return THEMES.find((t) => t.key === key) ?? THEMES[0];
}

const SAVED_KEY = "pos.theme";

/** Colours this whole device's screens; remembered so the next page opens in the right colours. */
export function applyTheme(key: string | null | undefined) {
  const t = themeOf(key).key;
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(SAVED_KEY, t);
  } catch {}
}

/** Sign-out: back to the app's own colours. */
export function clearTheme() {
  delete document.documentElement.dataset.theme;
  try {
    localStorage.removeItem(SAVED_KEY);
  } catch {}
}
