(() => {
  const d = document;
  const slug = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);

  function onReady(fn) {
    if (d.readyState === "loading") {
      d.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function injectLink({
    href,
    text = "Open",
    className = "game",
    id,
    target = "_blank",
    rel = "noopener",
  }) {
    const host = d.getElementById("messagingContent");
    if (!host) return;
    const elId = id || `embed-${slug(text || href)}`;
    if (d.getElementById(elId)) return;

    const a = d.createElement("a");
    a.id = elId;
    a.href = href;
    a.textContent = text;
    a.className = className;
    a.target = target;
    a.rel = rel;

    host.appendChild(a);
  }

  function injectLinkDelayed(options) {
    const { delay = 0, ...rest } = options || {};
    onReady(() => setTimeout(() => injectLink(rest), delay));
  }

  window.GatesInline = {
    injectLink,
    injectLinkDelayed,
    onReady,
  };
})();
