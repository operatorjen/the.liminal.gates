import crypto from "crypto";
import { redis } from "./redis.js";

const STREAM = "gl:events";
const RANK_DEPTH = "gl:rank:depth";
const RANK_OPENED = "gl:rank:opened"; 
const RANK_RECENT = "gl:rank:recent";
const POP_PATH = "gl:path:popularity";
const ACTOR_HASH = (id) => `gl:actor:${id}`;
const ACTOR_OPEN = (id) => `gl:actor:${id}:opened`;

function hmac(s, key = process.env.SECRET || "dev") {
  return crypto.createHmac("sha256", key).update(s).digest("hex");
}

function clientIP(req) {
  return (req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress || "").toString();
}

function actorId(req) {
  const ip = clientIP(req);
  const ua = req.get("user-agent") || "";
  return hmac(`${ip}|${ua}`).slice(0, 16);
}

function depthOf(pathStr) {
  if (!pathStr) return 0;
  return pathStr.split("/").filter(Boolean).length;
}

async function xadd(event, fields) {
  try {
    await redis.xadd(STREAM, "*", "t", event, ...Object.entries(fields).flat());
  } catch { }
}

export async function trackGateView(req, gatePath) {
  const id = actorId(req);
  const ua = req.get("user-agent") || "";
  const now = Date.now();

  const aKey = ACTOR_HASH(id);

  const tx = redis.multi();
  tx.hset(aKey, "id", id, "ua", ua, "last", now);
  tx.hsetnx(aKey, "created", now);
  tx.zadd(RANK_RECENT, now, id);
  tx.expire(aKey, 604800); 
  tx.zincrby(POP_PATH, 1, gatePath);
  await tx.exec();

  xadd("gate_view", { id, ua, path: gatePath, ts: String(now) });
}

export async function trackGatePass(req, gatePath) {
  const id = actorId(req);
  const ua = req.get("user-agent") || "";
  const now = Date.now();
  const d = depthOf(gatePath);

  const aKey = ACTOR_HASH(id);
  const openKey = ACTOR_OPEN(id);

  const r1 = await redis.multi()
    .hset(aKey, "id", id, "ua", ua, "last", now, "last_gate", gatePath)
    .hsetnx(aKey, "created", now)
    .sadd(openKey, gatePath)
    .scard(openKey)
    .hget(aKey, "max_depth")
    .exec();

  const openedCount = Number(r1?.[3]?.[1] ?? 0);
  const prevMax = Number(r1?.[4]?.[1] ?? 0);
  const newMax = Number.isFinite(prevMax) ? Math.max(prevMax, d) : d;

  const tx = redis.multi();
  tx.zadd(RANK_OPENED, openedCount, id);
  tx.zadd(RANK_RECENT, now, id);
  tx.hset(aKey, "max_depth", newMax);
  tx.expire(aKey, 604800); 
  if (d >= prevMax) tx.hset(aKey, "furthest", gatePath);
  tx.zincrby(POP_PATH, 1, gatePath);
  tx.zadd(RANK_DEPTH, newMax, id);
  await tx.exec();
  xadd("gate_pass", { id, ua, path: gatePath, depth: String(d), opened: String(openedCount), ts: String(now) });
}

export async function trackViewAccess(req, viewPath) {
  const id = actorId(req);
  const ua = req.get("user-agent") || "";
  const now = Date.now();
  await redis.multi()
    .hset(ACTOR_HASH(id), "id", id, "ua", ua, "last", now)
    .zadd(RANK_RECENT, now, id)
    .zincrby(POP_PATH, 1, viewPath)
    .exec();
  xadd("view_access", { id, ua, path: viewPath, ts: String(now) });
}