// "Meet the alpacas" cards: each card reveals one fact (disclosure pattern, keyboard friendly).
export function init([root]) {
  for (const btn of root.querySelectorAll(".alpaca-front")) {
    const fact = document.getElementById(btn.getAttribute("aria-controls"));
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(open));
      fact.hidden = !open;
    });
  }
}
