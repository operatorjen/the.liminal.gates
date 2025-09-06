import Tokens from "csrf";

const tokens = new Tokens();
const CSRF_COOKIE = process.env.CSRF_COOKIE_NAME || "the.liminal.gates";

export function ensureCsrfSecret(req, res) {
  let secret = req.cookies[CSRF_COOKIE];
  if (!secret) {
    secret = tokens.secretSync();
    const secure = process.env.NODE_ENV === "production";
    res.cookie(CSRF_COOKIE, secret, {
      httpOnly: true,
      sameSite: "Strict",
      secure,
      maxAge: 7 * 24 * 3600 * 1000,
      path: "/"
    });
  }
  return secret;
}

export function createCsrfToken(req, res) {
  const secret = ensureCsrfSecret(req, res);
  return tokens.create(secret);
}

export function verifyCsrfToken(req, token) {
  const secret = req.cookies[CSRF_COOKIE];
  if (!secret || !token) return false;
  return tokens.verify(secret, token);
}