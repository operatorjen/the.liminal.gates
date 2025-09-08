import express from "express";
import { redis } from "../utils/redis.js";

export const leaderboardRouter = express.Router();

leaderboardRouter.use((req, res, next) => {
  const need = process.env.LB_TOKEN;
  if (!need) return next();
  const t = req.query.token || req.get("x-leaderboard-token") || (req.cookies?.lb_token);
  if (t === need) return next();
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  return res.status(403).type("text/plain").send("forbidden");
});

async function fetchRank(zset, n = 25) {
  const rows = await redis.zrevrange(zset, 0, n - 1, "WITHSCORES");
  const out = [];
  for (let i = 0; i < rows.length; i += 2) {
    out.push({ id: rows[i], score: Number(rows[i + 1]) });
  }
  return out;
}

async function hydrateActors(items) {
  if (!items.length) return [];
  const pipeline = redis.multi();
  for (const { id } of items) pipeline.hgetall(`gl:actor:${id}`);
  const results = await pipeline.exec();
  return items.map((row, idx) => ({
    ...row,
    ...(results?.[idx]?.[1] || {})
  }));
}

leaderboardRouter.get("/", async (req, res) => {
  const [depth, opened, recent, popular] = await Promise.all([
    fetchRank("gl:rank:depth", 25),
    fetchRank("gl:rank:opened", 25),
    fetchRank("gl:rank:recent", 25),
    redis.zrevrange("gl:path:popularity", 0, 24, "WITHSCORES"),
  ]);

  const [byDepth, byOpened, byRecent] = await Promise.all([
    hydrateActors(depth),
    hydrateActors(opened),
    hydrateActors(recent),
  ]);

  const pop = [];
  for (let i = 0; i < popular.length; i += 2) {
    pop.push({ path: popular[i], count: Number(popular[i + 1]) });
  }

  res.render("leaderboard", {
    title: "Gate Leaderboard",
    byDepth,
    byOpened,
    byRecent,
    breadcrumb: [],
    styles: "",
    bodyClass: "",
    gatePath: "",
    scripts: "",
    pop,
  });
});

leaderboardRouter.get("/login", (req, res) => {
  const t = req.query.token;
  if (!t || t !== process.env.LB_TOKEN) return res.status(403).send("forbidden");
  res.cookie("lb_token", t, {
    httpOnly: true,
    sameSite: "Strict",
    maxAge: 7 * 24 * 3600 * 1000,
    secure: process.env.NODE_ENV === "production",
  });
  res.redirect("/leaderboard?ok=1");
});
