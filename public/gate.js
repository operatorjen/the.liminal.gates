(() => {
  const t = document.getElementById("t0");
  if (t) t.value = Date.now();
  for (const el of document.querySelectorAll(".hp")) el.style.display = "none";
})();
