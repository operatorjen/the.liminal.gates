import dotenv from "dotenv";
dotenv.config();

import fs from "fs/promises";
import path from "path";
import express from "express";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";

import { gatesRouter } from "./routes/gates.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import "./utils/redis.js"; 
import { makeBreadcrumb, EMOJI } from "./utils/crumbs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", true);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/public", express.static(path.join(__dirname, "public")));

app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

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

app.get("/", (req, res) => {
  const viewPath = (req.params[0] || "").split("/").filter(Boolean).join("/");
  const { crumbs } = makeBreadcrumb(viewPath);

  res.render("view", {
    title: "Welcome",
    gatePath: "",
    chainOk: true,
    breadcrumb: crumbs,
    opened: [],
    children: EMOJI,
    nextHint: "Start by visiting any gate: /gate/🏔️",
  });
});

app.use(gatesRouter);
app.use("/leaderboard", leaderboardRouter);

app.use((_, res) => res.status(404).type("text/plain").send("404"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Gates activated :${PORT}`));
