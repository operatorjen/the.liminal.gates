#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import Redis from "ioredis";

function usage() {
  console.error(`
Generate a one-time RS256 jump token and (optionally) a claim URL.

Usage:
  JUMP_JWT_PRIVATE_KEY_PATH=./keys/jump-issuer.priv.pem \\
  REDIS_URL=redis://127.0.0.1:6379 \\
  node scripts/jump-link.mjs --origin http://localhost:3000 --host localhost:3000 --path "🏔️/🌋/💎" --ttl 60 [--claim]

Required:
  --origin   Base URL where /jump lives (scheme+host+port)
  --host     Hostname to bind inside token (must equal req.hostname)
  --path     Emoji path to jump to (slash-separated)
Optional:
  --ttl      Token lifetime in seconds (default 60)
  --claim    Also store token in Redis under a random id and print /jump/claim/<id> URL

Env:
  JUMP_JWT_PRIVATE_KEY_PEM or JUMP_JWT_PRIVATE_KEY_PATH
  JUMP_JWT_ISSUER (default: liminalgates:jump)
  REDIS_URL (required only if --claim is used)
`);
  process.exit(1);
}

function parseArgs() {
  const out = {};
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i];
    if (!k.startsWith("--")) continue;
    const nx = process.argv[i + 1];
    if (k === "--claim") { out.claim = true; continue; }
    if (!nx || nx.startsWith("--")) usage();
    out[k.slice(2)] = nx;
    i++;
  }
  return out;
}

const args = parseArgs();
const { origin, host, path, ttl = "60", claim = false } = args;
if (!origin || !host || !path) usage();

const PRIV_PEM =
  process.env.JUMP_JWT_PRIVATE_KEY_PEM || (process.env.JUMP_JWT_PRIVATE_KEY_PATH ? fs.readFileSync(process.env.JUMP_JWT_PRIVATE_KEY_PATH, "utf8") : null);
if (!PRIV_PEM) {
  console.error("Missing JUMP_JWT_PRIVATE_KEY_PEM or *_PATH");
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const exp = now + Number(ttl);
const jti = crypto.randomBytes(16).toString("base64url");

const payload = {
  v: 1,
  aud: "jump",
  iss: process.env.JUMP_JWT_ISSUER || "liminalgates:jump",
  h: host,
  p: path,
  iat: now,
  nbf: now - 3,
  exp,
  jti
};

const token = jwt.sign(payload, PRIV_PEM, { algorithm: "RS256" });

if (claim) {
  const id = crypto.randomBytes(16).toString("base64url");
  const ttlSec = Math.max(30, Math.min(600, Number(ttl) || 60));

  const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
  try {
    await redis.set(`sk:jwt:id:${id}`, token, "EX", ttlSec);
  } finally {
    await redis.quit();
  }

  const claimURL  = new URL(`/jump/claim/${id}`, origin);
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toLocaleString();

  console.log(`One-time claim URL ready and valid for ${ttlSec} seconds (expires ${expiresAt}):\n`);
  console.log(String(claimURL) + "\n");
} else {
  const expiresAt = new Date(Date.now() + ttl * 1000).toLocaleString();
  console.log(`Token ready and valid for ${ttl} seconds (expires ${expiresAt}). Validation endpoint is ${origin}/jump:\n\n${token}\n`);
}
