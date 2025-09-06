import express from "express";
import { ensureCsrfSecret, createCsrfToken, verifyCsrfToken } from "../utils/csrf.js";
import { readGateState, writeGateCookie, chainFor, chainSatisfied, addGate } from "../utils/jwt.js";
import { trackGateView, trackGatePass, trackViewAccess } from "../utils/telemetry.js";
import { getQuestionForPath, isCorrectAnswer } from "../utils/questions.js";
import { makeBreadcrumb, EMOJI } from "../utils/crumbs.js";
import { forceEmojiPresentationPath, normalizeKeyPath, splitPath, asKeyPath, asCanonPath, isEmojiPath } from "../utils/emojiPath.js";

export const gatesRouter = express.Router();

gatesRouter.get(/^\/gate\/(.*)$/, async (req, res) => {
  const raw = req.params[0] || "";
  if (!isEmojiPath(raw)) {
    return res.status(400).type("text/plain").send("Bad gate: only emoji allowed");
  }
  const canon = forceEmojiPresentationPath(raw);

  ensureCsrfSecret(req, res);
  const csrfToken = createCsrfToken(req, res);

  if (raw !== canon) {
    const prefix = req.baseUrl || "";
    return res.redirect(308, `${prefix}/gate/${encodeURI(canon)}`);
  }

  const gatePath = canon;
  const keyPath  = normalizeKeyPath(gatePath);
  if (!keyPath) return res.status(400).type("text/plain").send("Bad gate");
  const state = await readGateState(req);
  const openedNorm = (state.opened || []).map(normalizeKeyPath);
  const prereq = chainFor(keyPath).slice(0, -1);
  const prereqOk = chainSatisfied({ ...state, opened: openedNorm }, prereq);

  if (openedNorm.includes(keyPath)) {
    return res.redirect(`/view/${encodeURI(canon)}`);
  }

  if (!prereqOk) {
    const have = new Set(openedNorm);
    const missing = prereq.filter(p => !have.has(p));
    const firstMissing = missing[0];
    const gotoCanon = encodeURI(
      forceEmojiPresentationPath(firstMissing)
    );
    const { crumbs } = makeBreadcrumb("");

    return res.status(403).render("forbidden", {
      title: "Forbidden",
      need: firstMissing,
      breadcrumb: crumbs,
      goto: `/gate/${gotoCanon}`
    });
  }

  trackGateView(req, gatePath).catch(() => {});

  const viewPath = encodeURI(canon);
  const { label: difficulty, question } = await getQuestionForPath(keyPath);
  
  const { crumbs } = makeBreadcrumb(viewPath);

  return res.render("gate", {
    title: `Gate: /${gatePath}`,
    gatePath,
    opened: state.opened,
    breadcrumb: crumbs,
    csrfToken,
    question,
    difficulty,
    errorMsg: null
  });
});

gatesRouter.post(/^\/gate\/(.*)\/solve$/, async (req, res) => {
  const raw = req.params[0] || "";
  const rawSegs   = splitPath(raw);
  const keyPath   = asKeyPath(rawSegs);
  if (!isEmojiPath(raw)) {
    return res.status(400).type("text/plain").send("Bad gate: only emoji allowed");
  }
  const canonPath = asCanonPath(rawSegs);

  if (!verifyCsrfToken(req, req.body._csrf)) {
    return res.status(403).type("text/plain").send("CSRF failed");
  }

  const t0 = Number(req.body.t0 || 0);
  const now = Date.now();
  if (!Number.isFinite(t0) || now - t0 < 1200) return res.status(412).type("text/plain").send("Too fast");
  if (req.body.website) return res.status(400).type("text/plain").send("Bad form");

  const state = await readGateState(req);
  const openedNorm = (state.opened || []).map(p => asKeyPath(splitPath(p)));

  const prereq = chainFor(keyPath).slice(0, -1);
  if (!chainSatisfied({ ...state, opened: openedNorm }, prereq)) {
    const missing = prereq.filter(p => !openedNorm.includes(p));
    const firstMissingURL = "/gate/" + encodeURI(asCanonPath(splitPath(missing[0])));
    return res.status(428).type("text/plain").send(`Precondition Required: visit ${firstMissingURL} first`);
  }

  const ok = await isCorrectAnswer(keyPath, req.body.answer);

  if (!ok) {
    const { crumbs } = makeBreadcrumb(canonPath);
    ensureCsrfSecret(req, res);
    const csrfToken = createCsrfToken(req, res);
    const { label: difficulty, question } = await getQuestionForPath(keyPath);

    return res.status(400).render("gate", {
      title: `Gate: /${canonPath}`,
      gatePath: canonPath,
      opened: state.opened,
      breadcrumb: crumbs,
      csrfToken,
      difficulty,
      question,
      errorMsg: "Incorrect answer. Try again."
    });
  }

  const nextState = addGate(state, keyPath);
  writeGateCookie(res, nextState);
  trackGatePass(req, keyPath).catch(() => {});

  return res.redirect(303, `/view/${canonPath}`);
});

gatesRouter.get(/^\/view\/(.*)$/, async (req, res) => {
  const raw = req.params[0] || "";
  if (!isEmojiPath(raw)) {
    return res.status(400).type("text/plain").send("Bad view: only emoji segments allowed");
  }
  const canon = forceEmojiPresentationPath(raw);

  if (raw !== canon) {
    const prefix = req.baseUrl || "";
    return res.redirect(308, `${prefix}/gate/${encodeURI(canon)}`);
  }

  const viewPath = canon;
  const keyPath  = normalizeKeyPath(canon);

  if (!keyPath) return res.status(400).type("text/plain").send("Bad view");

  const state = await readGateState(req);
  const openedNorm = (state.opened || []).map(normalizeKeyPath);
  const fullChain = chainFor(keyPath);
  const { crumbs } = makeBreadcrumb(viewPath);

  if (!chainSatisfied({ ...state, opened: openedNorm }, fullChain)) {
    const have = new Set(openedNorm);
    const missing = fullChain.filter(p => !have.has(p));
    const firstMissing = missing[0];

    return res.status(403).render("forbidden", {
      title: "Forbidden",
      need: firstMissing,
      breadcrumb: crumbs,
      goto: `/gate/${encodeURI(forceEmojiPresentationPath(firstMissing))}`
    });
  }

  trackViewAccess(req, keyPath).catch(() => {});
  const children = EMOJI.map(sym =>
    forceEmojiPresentationPath(`${keyPath}/${sym}`)
  );

  res.render("view", {
    title: "",
    breadcrumb: crumbs,
    gatePath: viewPath,
    chainOk: true,
    opened: state.opened,
    children,
    nextHint: "Pick another branch, or continue further on this one."
  });
});