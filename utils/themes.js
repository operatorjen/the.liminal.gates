import { normalizeKeyPath } from "./emojiPath.js";

export function themeForPath(keyPath) {
  const key   = normalizeKeyPath(keyPath);
  const depth = key.split("/").filter(Boolean).length;

  if (depth >= 5) {
    return {
      name: "abyss",
      bodyClass: "theme-abyss",
      styles: ["/public/style.css", "/public/themes/abyss.css"],
      ws: true
    };
  }

  if (depth >= 3) {
    return {
      name: "liminal",
      bodyClass: "theme-liminal",
      styles: ["/public/style.css", "/public/themes/liminal.css"],
      ws: false
    };
  }

  return null;
}
