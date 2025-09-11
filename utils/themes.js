import { normalizeKeyPath } from "./emojiPath.js";

const EXACT_RAW = new Map([
  ["🧬/🧬/🧬/🧬/🧬/🫟️/🧬", {
    name: "Artificial Lifeforms",
    bodyClass: "game",
    styles: ["/public/style.css", "/public/themes/abyss.css", "/public/themes/artificial.lifeforms.css"],
    inlineJs: `GatesInline.injectLinkDelayed({
      href: "https://operatorjen.github.io/artificial.lifeforms/",
      text: "Artificial Lifeforms",
      className: "game",
      id: "embed-lifeforms",
      parentSelector: "#messagingContent",
      delay: 3000
    });`,
    ws: true
  }],
  ["❤‍🔥️/❤‍🔥️/❤‍🔥️/❤‍🔥️/❤‍🔥️/🧬/❤‍🔥️", {
    name: "Multi-Consumer State Visualization",
    bodyClass: "game",
    styles: ["/public/style.css", "/public/themes/abyss.css", "/public/themes/mcsv.css"],
    inlineJs: `GatesInline.injectLinkDelayed({
      href: "https://operatorjen.github.io/mcsv/",
      text: "Multi-Consumer State Visualization",
      className: "game",
      id: "embed-mcsv",
      parentSelector: "#messagingContent",
      delay: 3000
    });`,
    ws: true
  }],
  ["🫘️/🫘️/🫘️/🫘️/🫘️/❤‍🔥️/🫘️", {
    name: "Bean Sims",
    bodyClass: "game",
    styles: ["/public/style.css", "/public/themes/abyss.css", "/public/themes/bean.sims.css"],
    inlineJs: `GatesInline.injectLinkDelayed({
      href: "https://operatorjen.github.io/bean.sims/",
      text: "Bean Sims",
      className: "game",
      id: "embed-beansims",
      parentSelector: "#messagingContent",
      delay: 3000
    });`,
    ws: true
  }],
  ["🪱️/🪱️/🪱️/🪱️/🪱️/🫘️/🪱️", {
    name: "1k Quantum Worm",
    bodyClass: "game",
    styles: ["/public/style.css", "/public/themes/abyss.css", "/public/themes/1k.quantumworm.css"],
    inlineJs: `GatesInline.injectLinkDelayed({
      href: "https://operatorjen.github.io/1k.quantumworm/",
      text: "1k Quantum Worm",
      className: "game",
      id: "embed-quantumworm",
      parentSelector: "#messagingContent",
      delay: 3000
    });`,
    ws: true
  }],
  ["🫟️/🫟️/🫟️/🫟️/🫟️/🪱️/🫟️", {
    name: "Art of Noise",
    bodyClass: "game",
    styles: ["/public/style.css", "/public/themes/abyss.css", "/public/themes/art.of.noise.css"],
    inlineJs: `GatesInline.injectLinkDelayed({
      href: "https://operatorjen.github.io/art.of.noise/",
      text: "Art of Noise",
      className: "game",
      id: "embed-noise",
      parentSelector: "#messagingContent",
      delay: 3000
    });`,
    ws: true
  }],
  ["🧩️/🧩️/🧩️/🧩️/🧩️/🫟️/🧩️", {
    name: "Systems as Games",
    bodyClass: "game",
    styles: ["/public/style.css", "/public/themes/abyss.css", "/public/themes/systems.as.games.css"],
    inlineJs: `GatesInline.injectLinkDelayed({
      href: "https://github.com/operatorjen/systems.as.games/blob/main/TRAIL.md",
      text: "Systems as Games",
      className: "game",
      id: "embed-systems",
      parentSelector: "#messagingContent",
      delay: 3000
    });`,
    ws: true
  }],
  ["📡️/📡️/📡️/📡️/📡️/🧩️/📡️", {
    name: "Signals as Games",
    bodyClass: "game",
    styles: ["/public/style.css", "/public/themes/abyss.css", "/public/themes/signals.as.games.css"],
     inlineJs: `GatesInline.injectLinkDelayed({
      href: "https://github.com/operatorjen/signals.as.games/blob/main/WELCOME.md",
      text: "Signals as Games",
      className: "game",
      id: "embed-signals",
      parentSelector: "#messagingContent",
      delay: 3000
    });`,
    ws: true
  }]
]);

const REPEAT = {
  // "🧬": {
  //   3: {
  //     name: "",
  //     bodyClass: "",
  //     styles: ["/public/style.css"]
  //   }
  // }
};

function norm(path) {
  const asString = Array.isArray(path) ? path.join("/") : String(path || "");
  return normalizeKeyPath(asString);
}

const EXACT_NORM = new Map(
  Array.from(EXACT_RAW, ([raw, theme]) => [norm(raw), theme])
);

function matchExact(key) {
  return EXACT_NORM.get(key) ?? null;
}

function matchRepeatByEmoji(segs) {
  if (segs.length === 0) return null;
  const first = segs[0];
  for (let i = 1; i < segs.length; i++) {
    if (segs[i] !== first) return null;
  }
  return REPEAT[first]?.[segs.length] ?? null;
}

export function themeForPath(keyPath) {
  const key   = norm(keyPath);
  const segs  = key.split("/").filter(Boolean);
  const depth = segs.length;

  const exact = matchExact(key);
  if (exact !== null) return exact;

  const byEmojiDepth = matchRepeatByEmoji(segs);
  if (byEmojiDepth !== null) return byEmojiDepth;

  if (depth >= 6) {
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
