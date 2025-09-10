import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { ensureCsrfSecret, createCsrfToken, verifyCsrfToken } from "../utils/csrf.js";
import fs from "fs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { redis } from "../utils/redis.js";
import { isEmojiPath, forceEmojiPresentationPath, normalizeKeyPath } from "../utils/emojiPath.js";
import { readGateState, writeGateCookie, addGate } from "../utils/jwt.js";

const jumpRouter = express.Router();

const PUB_PEM = process.env.JUMP_JWT_PUBLIC_KEY_PEM || (process.env.JUMP_JWT_PUBLIC_KEY_PATH ? fs.readFileSync(process.env.JUMP_JWT_PUBLIC_KEY_PATH, "utf8") : null);

const ISSUER = process.env.JUMP_JWT_ISSUER || "liminalgates:jump";
const NO_JTI = process.env.JUMP_JWT_NO_JTI === "1";
const JTI_TTL = Math.max(30, Math.min(600, Number(process.env.JTI_TTL_SEC) || 600));

const ALLOWED_HOSTS = new Set((process.env.JUMP_ALLOWED_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean));

function normalizeHost(h) {
  try {
    return new URL("http://" + h).hostname; 
  } catch {
    return h;
  }
}

function rateLimit({ windowSec = 60, max = 30 } = {}) {
  return async (req, res, next) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || "unknown";
      const key = `rl:jump:${ip}`;
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, windowSec);
      if (n > max) return res.status(429).type("text/plain").send("Too many requests");
    } catch {}
    next();
  };
}

async function processToken(req, res, token) {
  if (!PUB_PEM) return res.status(503).type("text/plain").send("Jump disabled");

  let payload;
  try {
    payload = jwt.verify(token, PUB_PEM, {
      algorithms: ["RS256"],
      audience: "jump",
      issuer: ISSUER,
      clockTolerance: 5,
    });
  } catch {
    return res.status(403).type("text/plain").send("Invalid token");
  }

  const claimed = normalizeHost(String(payload.h || ""));
  const actual = req.hostname;
  if (!claimed || claimed !== actual) {
    return res.status(403).type("text/plain").send("Wrong host");
  }
  if (ALLOWED_HOSTS.size && !ALLOWED_HOSTS.has(actual)) {
    return res.status(403).type("text/plain").send("Host not allowed");
  }

  if (!NO_JTI) {
    const jti = String(payload.jti || "");
    if (!jti) return res.status(403).type("text/plain").send("Bad token");
    const now = Math.floor(Date.now() / 1000);
    const pad = 60;
    const ttl = Math.max(30, Math.min(JTI_TTL, (payload.exp || now) - now + pad));
    const ok = await redis.set(`sk:jwt:jti:${jti}`, "1", "NX", "EX", ttl);
    if (ok !== "OK") return res.status(403).type("text/plain").send("Expired token");
  }

  const rawPath = String(payload.p || "");
  const cleaned = rawPath.replace(/\s+/gu, "").replace(/\/{2,}/g, "/");
  const canon = forceEmojiPresentationPath(cleaned);
  if (!isEmojiPath(canon)) return res.status(400).type("text/plain").send("Bad path");
  const keyPath = normalizeKeyPath(canon);
  if (!keyPath) return res.status(400).type("text/plain").send("Bad path");

  if (payload.scope && typeof payload.scope === "string") {
    if (!keyPath.startsWith(payload.scope)) {
      return res.status(403).type("text/plain").send("Out of scope");
    }
  }

  const state = await readGateState(req);
  const nextState = addGate(state, keyPath);
  writeGateCookie(res, nextState);
  return res.redirect(303, `/view/${encodeURI(canon)}`);
}

jumpRouter.get("/jump", (req, res) => {
  ensureCsrfSecret(req, res);
  const csrfToken = createCsrfToken(req, res);

  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  );
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.render("jump", { 
    title: "Enter Jump Token", 
    token: "", 
    auto: false, 
    nonce: "",
    styles: "",
    bodyClass: "",
    gatePath: "",
    breadcrumb: [],
    scripts: "",
    csrfToken
  });
});

jumpRouter.get("/jump/claim/:id", async (req, res) => {
  ensureCsrfSecret(req, res);
  const csrfToken = createCsrfToken(req, res);

  const id = String(req.params.id || "");
  const key = `sk:jwt:id:${id}`;
  const token = await redis.get(key);
  if (!token) return res.status(410).type("text/plain").send("Expired link");

  await redis.del(key);

  const nonce = crypto.randomBytes(16).toString("base64");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`
  );
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.render("jump", { 
    title: "Claiming Pass", 
    token, 
    auto: true, 
    nonce,
    styles: "",
    bodyClass: "",
    gatePath: "",
    breadcrumb: [],
    scripts: "",
    csrfToken 
  });
});

jumpRouter.post("/jump", rateLimit(), async (req, res) => {
    if (!verifyCsrfToken(req, req.body._csrf)) return res.status(403).type("text/plain").send("CSRF failed");

    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).type("text/plain").send("Missing token");
    return processToken(req, res, token);
  }
);

export default jumpRouter;
