import { EMOJI } from "./crumbs.js";

const FE0F = "\uFE0F";
export const VS_RX = /[\uFE0E\uFE0F]/g;
export const FORCE_EMOJI = new Set(EMOJI.map(s => s.normalize("NFC").replace(VS_RX, "")));

export const splitPath = p => String(p || "").split("/").filter(Boolean);
export const normalizeSegments = segs => segs.map(s => s.normalize("NFC").replace(VS_RX, ""));
export const canonicalizeSegments = segs => normalizeSegments(segs).map(s => FORCE_EMOJI.has(s) ? s + FE0F : s);

export const asKeyPath   = segs => normalizeSegments(segs).join("/");
export const asCanonPath = segs => canonicalizeSegments(segs).join("/");

export function normalizeKeyPath(rawPath) {
  return splitPath(rawPath).map(s => s.normalize("NFC").replace(VS_RX, "")).join("/");
}

export function forceEmojiPresentationPath(rawPath) {
  const segs = splitPath(rawPath);
  const out = segs.map(seg => {
    const bare = seg.normalize("NFC").replace(VS_RX, "");
    return FORCE_EMOJI.has(bare) ? bare + FE0F : seg;
  });
  return out.join("/");
}

export function isEmojiPath(rawPath) {
  const segs = splitPath(rawPath);
  return segs.every(seg => FORCE_EMOJI.has(seg.normalize("NFC").replace(VS_RX, "")));
}