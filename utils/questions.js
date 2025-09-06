import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

let CONFIG = null;

function depthOf(p) {
  return String(p || "").split("/").filter(Boolean).length;
}

function norm(x) {
  return String(x ?? "").trim().toLowerCase();
}

function hashToIndex(s, modulo, season = "") {
  const h = crypto.createHash("sha256").update(String(season) + "|" + String(s)).digest();
  const n = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
  return n % Math.max(1, modulo);
}

function asQuestion(node) {
  if (!node) return null;
  if (node.q && Array.isArray(node.answers)) {
    return { q: String(node.q), answers: node.answers.map(String) };
  }
  return null;
}

async function loadConfig() {
  if (CONFIG) return CONFIG;
  const file = path.resolve(process.cwd(), "questions.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const cfg = JSON.parse(raw);

    if (!Array.isArray(cfg.tiers) || cfg.tiers.length === 0) {
      throw new Error("questions.json: missing 'tiers'");
    }
    for (const t of cfg.tiers) {
      if (!Array.isArray(t.pool) || t.pool.length === 0) {
        throw new Error(`Tier '${t.name || "unnamed"}' has empty pool`);
      }
    }
    if (cfg.overrides && !Array.isArray(cfg.overrides)) {
      throw new Error("'overrides' must be an array");
    }

    CONFIG = cfg;
  } catch (e) {
    CONFIG = {
      season: "",
      tiers: [{ name: "fallback", depth_min: 1, pool: [{ q: "Type 'ok'", answers: ["ok"] }] }],
      overrides: []
    };
  }
  return CONFIG;
}

function findTierForDepth(cfg, d) {
  const matches = cfg.tiers.filter(t =>
    (t.depth_min == null || d >= Number(t.depth_min)) &&
    (t.depth_max == null || d <= Number(t.depth_max))
  );
  if (matches.length) {
    return matches.reduce((best, t) => {
      const bmin = Number(best.depth_min ?? -Infinity);
      const tmin = Number(t.depth_min ?? -Infinity);
      return tmin >= bmin ? t : best;
    });
  }
  return cfg.tiers[cfg.tiers.length - 1];
}

function compileRegex(pat) {
  try { return new RegExp(pat); } catch { return null; }
}

function pickFromPool(cfg, label, pool, gatePath, fixedIndex) {
  const idx = Number.isInteger(fixedIndex)
    ? ((fixedIndex % pool.length) + pool.length) % pool.length
    : hashToIndex(gatePath, pool.length, cfg.season || "");
  const q = asQuestion(pool[idx]);
  return { label, question: q || asQuestion(pool[0]), index: idx };
}

export async function getQuestionForPath(gatePath, opts = {}) {
  const cfg = await loadConfig();
  const d = depthOf(gatePath);
  const fixedIndex = opts.fixedIndex;

  if (Array.isArray(cfg.overrides)) {
    const exact = cfg.overrides.find(o => o.path === gatePath);
    if (exact) {
      if (exact.q && exact.answers) {
        return { label: exact.name || "override", question: asQuestion(exact) };
      }
      if (Array.isArray(exact.pool) && exact.pool.length) {
        return pickFromPool(cfg, exact.name || "override", exact.pool, gatePath, fixedIndex);
      }
    }

    for (const o of cfg.overrides) {
      if (!o.match) continue;
      const re = compileRegex(o.match);
      if (!re) continue;
      if (re.test(gatePath)) {
        if (o.q && o.answers) {
          return { label: o.name || "override", question: asQuestion(o) };
        }
        if (Array.isArray(o.pool) && o.pool.length) {
          return pickFromPool(cfg, o.name || "override", o.pool, gatePath, fixedIndex);
        }
      }
    }
  }

  const tier = findTierForDepth(cfg, d);
  return pickFromPool(cfg, tier.name || "tier", tier.pool, gatePath, fixedIndex);
}

export async function isCorrectAnswer(gatePath, userAnswer) {
  const { question } = await getQuestionForPath(gatePath, { fixedIndex: arguments[2] });
  const a = norm(userAnswer);
  return (question?.answers || []).some(ans => norm(ans) === a);
}