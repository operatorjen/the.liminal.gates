export const PREVIEW_UA_REGEX =
  /(slackbot|discordbot|facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|skypeuripreview|redditbot|bitlybot|vkshare|embedly|pinterest|quora|linkpreview|unfurl)/i;

export function isLinkPreviewBot(req) {
  const ua = String(req.get("user-agent") || "");
  const purpose = String(req.get("purpose") || "");
  if (PREVIEW_UA_REGEX.test(ua)) return true;
  if (/^preview$/i.test(purpose)) return true;
  if (req.method === "HEAD") return true;
  return false;
}