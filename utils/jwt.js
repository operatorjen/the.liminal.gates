import crypto from "crypto";
import jwt from "jsonwebtoken";
import { redis } from "./redis.js";
import { normalizeKeyPath } from "./emojiPath.js";

const COOKIE_NAME = "gates";
const MAX_AGE_MS  = 7 * 24 * 3600 * 1000;
const MAX_AGE_S   = Math.floor(MAX_AGE_MS / 1000);
const MAX_LEAVES = 500;
const SKEY = (sid) => `gl:session:${sid}`;

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function newSid() {
  return b64url(crypto.randomBytes(24));
}

function emptyState(sid = newSid()) {
  return { ver: 1, sid, opened: [] };
}

async function loadStateFromRedis(sid) {
  try {
    const raw = await redis.get(SKEY(sid));
    if (!raw) return { opened: [] };
    const obj = JSON.parse(raw);
    if (!Array.isArray(obj.opened)) return { opened: [] };
    const opened = Array.from(new Set(obj.opened.map(normalizeKeyPath)));
    return { opened };
  } catch {
    return { opened: [] };
  }
}

function persistStateToRedis(state, ttlMs = MAX_AGE_MS) {
  const payload = JSON.stringify({ opened: state.opened || [] });
  redis.set(SKEY(state.sid), payload, "PX", Math.max(1, ttlMs)).catch(() => {});
}

export async function readGateState(req) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return emptyState();

    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (!payload || payload.ver !== 1 || !payload.sid) return emptyState();

    const { opened } = await loadStateFromRedis(payload.sid);
    return { ver: 1, sid: payload.sid, opened };
  } catch {
    return emptyState();
  }
}

export function writeGateCookie(res, state) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + MAX_AGE_S;
  const token = jwt.sign(
    { ver: 1, sid: state.sid, iat: now, exp },
    process.env.JWT_SECRET,
    { algorithm: "HS256" }
  );

  const secure = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "Strict",
    secure,
    path: "/",
    maxAge: MAX_AGE_MS,
  });

  persistStateToRedis(state, (exp - now) * 1000);
}

export function chainFor(pathStr) {
  const parts = String(pathStr || "").split("/").filter(Boolean);
  const chain = [];
  for (let i = 0; i < parts.length; i++) chain.push(parts.slice(0, i + 1).join("/"));
  return chain;
}

export function chainSatisfied(state, chain) {
  const have = new Set((state.opened || []).map(normalizeKeyPath));
  for (const p of (chain || []).map(normalizeKeyPath)) {
    if (have.has(p)) continue;
    let ok = false;
    for (const x of have) { if (x.startsWith(p + "/")) { ok = true; break; } }
    if (!ok) return false;
  }
  return true;
}

export function addGate(state, gatePath) {
  const sid = state.sid || newSid();
  const next = new Set([
    ...(state.opened || []).map(normalizeKeyPath),
    normalizeKeyPath(gatePath),
  ]);

  const arr = Array.from(next).sort((a, b) => b.length - a.length);
  const kept = [];
  for (const p of arr) {
    if (kept.some(x => x.startsWith(p + "/"))) continue;
    kept.push(p);
    if (kept.length >= MAX_LEAVES) break;
  }
  kept.sort();
  return { ver: 1, sid, opened: kept };
}