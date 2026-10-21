// Menu filters: the list is pre-rendered; this only shows/hides items.
import { loadDict, t } from "./i18n.js";

export async function init([root]) {
  await loadDict();
  const filters = root.querySelector("[data-menu-filters]");
  const items = [...root.querySelectorAll(".menu-item")];
  const empty = root.querySelector("[data-menu-empty]");
  const count = root.querySelector("[data-menu-count]");
  const glutenNote = root.querySelector("[data-gluten-note]");
  filters.hidden = false;

  const apply = () => {
    const cat = filters.querySelector('input[name="cat"]:checked')?.value || "";
    const diets = [...filters.querySelectorAll('input[name="diet"]:checked')].map((i) => i.value);
    let shown = 0;
    for (const li of items) {
      const tags = li.dataset.tags.split(" ").filter(Boolean);
      const visible = (!cat || li.dataset.cat === cat) && diets.every((d) => tags.includes(d));
      li.hidden = !visible;
      if (visible) shown++;
    }
    empty.hidden = shown > 0;
    count.textContent = t("food.count", { n: shown });
    // No dish is tagged gluten-free yet: point to the kitchen instead of showing nothing.
    glutenNote.classList.toggle("demo-note", diets.includes("glutenFree"));
  };
  filters.addEventListener("change", apply);
}
