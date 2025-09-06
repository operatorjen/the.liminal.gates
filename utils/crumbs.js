import { canonicalizeSegments } from "../utils/emojiPath.js";

export const EMOJI = ["🏔","〰️","🌋","💎","💐","🌳","🪵"];

export function makeBreadcrumb(rawPath) {
  let path = String(rawPath || "");

  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch { }

  path = path.replace(/^\/(?:view|gate)\//, "").replace(/^\/+/, "");

  const rawSegs = path.split("/").filter(Boolean).map(s => {
    try { return decodeURIComponent(s); } catch { return s; }
  });

  const segs = canonicalizeSegments(rawSegs);

  const h1 = segs.length ? segs[segs.length - 1] : "🏔️";
  const crumbs = [{ label: "🏔️", href: "/" }];

  const acc = [];
  for (const seg of segs) {
    acc.push(seg);
    crumbs.push({
      label: seg,
      href: "/view/" + acc.map(encodeURIComponent).join("/")
    });
  }

  return { h1, crumbs };
}