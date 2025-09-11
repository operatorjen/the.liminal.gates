import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import express from "express";
import cookieParser from "cookie-parser";
import cookie from "cookie";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";
import { redis } from "./utils/redis.js";
import { normalizeKeyPath } from "./utils/emojiPath.js";
import { chainFor, chainSatisfied, readGateState, addRecent, saveState } from "./utils/jwt.js";
import jwt from "jsonwebtoken";

import { gatesRouter } from "./routes/gates.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import "./utils/redis.js"; 
import { makeBreadcrumb, EMOJI } from "./utils/crumbs.js";
import { themeForPath } from "./utils/themes.js";
import jumpRouter from "./routes/jumps.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const ONE_WEEK_MS = 7 * 24 * 3600 * 1000;
const CHATKEY = (room) => `gl:chat:${room}`;

const app = express();
app.set("trust proxy", true);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

const bannedUA = new Set(JSON.parse(await fs.readFile("./ua_banned.json", "utf8")));
function dropFast(res, status = 410) {
  res.set("Connection", "close");
  res.set("Cache-Control", "public, max-age=2592000, immutable");
  res.set("Content-Length", "0");
  return res.status(status).end();
}
app.use((req, res, next) => {
  const ua = req.get("user-agent") || "";
  if (bannedUA.has(ua)) return dropFast(res, 410);
  next();
});

app.use(async (req, res, next) => {
  try {
    const state = await readGateState(req);
    writeGateCookie(res, state);
    req.gateState = state;
  } catch { }
  next();
});

app.use(async (req, _, next) => {
  if (req.method !== "GET") return next();
  const m = req.path.match(/^\/(?:view|gate)\/(.+)/);
  if (!m) return next();
  try {
    const keyPath = normalizeKeyPath(m[1]);
    if (!keyPath) return next();
    const state = await readGateState(req);
    const nextState = addRecent(state, keyPath);
    saveState(nextState);
  } catch { }
  next();
});

app.get("/", async (req, res) => {
  const viewPath = (req.params[0] || "").split("/").filter(Boolean).join("/");
  const state = await readGateState(req);
  try { writeGateCookie(res, state); } catch {}

  const opened = (state.opened || []).map(normalizeKeyPath);
  const recent = opened
    .slice()
    .sort((a, b) => {
      const da = a.split("/").length, db = b.split("/").length;
      return db - da || b.localeCompare(a);
    })
    .slice(0, 8)
    .map(p => ({
      label: p.split("/").pop() || "🏔️",
      href: "/view/" + p.split("/").map(encodeURIComponent).join("/")
     }));
  
  const { crumbs } = makeBreadcrumb(viewPath);
  const theme = themeForPath(viewPath) || {};

  res.render("view", {
    title: "Welcome",
    gatePath: "",
    chainOk: true,
    breadcrumb: crumbs,
    opened,
    children: EMOJI,
    styles: theme.styles,
    scripts: theme.scripts,
    inlineCss: theme.inlineCss,
    inlineJs: theme.inlineJs,
    bodyClass: theme.bodyClass,
    wsEnabled: !!theme.ws,
    recent
  });
});

app.use(gatesRouter);
app.use(jumpRouter);
app.use("/leaderboard", leaderboardRouter);

app.use((_, res) => res.status(404).type("text/plain").send("404"));

const server = createServer(app);
const io = new Server(server, { path: "/ws" });
const SKEY = (sid) => `gl:session:${sid}`;

async function saveMessage(room, msg) {
  const key = CHATKEY(room);
  await redis.zadd(key, msg.ts, JSON.stringify(msg));
  await redis.zremrangebyscore(key, 0, Date.now() - ONE_WEEK_MS);
  await redis.pexpire(key, ONE_WEEK_MS + 24 * 3600 * 1000).catch(() => {});
}

async function loadRecentMessages(room, limit = 100) {
  const key = CHATKEY(room);
  const cutoff = Date.now() - ONE_WEEK_MS;
  const rows = await redis.zrangebyscore(key, cutoff, "+inf");
  const parsed = rows.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  return parsed.slice(-limit);
}

const ws = io.of("/gatews");
ws.use(async (socket, next) => {
  try {
    const cookies = cookie.parse(socket.request.headers.cookie || "");
    const token = cookies["gates"];
    if (!token) return next(new Error("no token"));
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const sid = payload?.sid;
    if (!sid) return next(new Error("bad sid"));

    await redis.pexpire(SKEY(sid), ONE_WEEK_MS + 24 * 3600 * 1000).catch(() => {});

    const keyPath = normalizeKeyPath(String(socket.handshake.auth?.keyPath || ""));
    if (!keyPath) return next(new Error("no path"));

    const raw = await redis.get(SKEY(sid));
    const opened = raw ? ((JSON.parse(raw).opened) || []) : [];
    const ok = chainSatisfied({ opened }, chainFor(keyPath));
    if (!ok) return next(new Error("forbidden"));

    socket.data.keyPath = keyPath;
    next();
  } catch (err) {
    next(new Error("auth failed"));
  }
});

ws.on("connection", (socket) => {
  const room = socket.data.keyPath;
  socket.join(room);
  socket.emit("hello", { room });

  loadRecentMessages(room, 100)
    .then(list => socket.emit("history", list))
    .catch(() => socket.emit("history", []));

  socket.on("whisper", async (text) => {
    const raw = String(text ?? "");
    const trimmed = raw.trim().slice(0, 350);
    if (!trimmed) return;
    const payload = {
      id: crypto.randomBytes(8).toString("hex"),
      ts: Date.now(),
      from: socket.id.slice(-4),
      msg: trimmed
    };

    try { await saveMessage(room, payload); } catch {}
    socket.to(room).emit("whisper", payload);
  });

  socket.on("disconnect", () => {
  });
});

server.listen(PORT, () => console.log(`Gates activated : ${PORT}`));
