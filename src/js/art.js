// Illustrated placeholders (inline SVG, a few hundred bytes each). Used by the build for the
// gallery and alpaca cards until real photos exist. Colours come from CSS tokens, so they
// follow the day/night theme.

const scenes = {
  grill: `<rect width="160" height="120" fill="var(--art-warm)"/>
    <path d="M30 86h100l-8 14H38z" fill="var(--art-dark)"/>
    <path d="M58 84c-10-16 6-22 2-38 14 10 18 22 10 38zM78 84c-8-20 10-26 6-46 16 14 18 30 8 46zM98 84c-6-12 6-18 4-30 10 8 12 20 6 30z" fill="var(--art-flame)"/>
    <path d="M34 84h92" stroke="var(--art-light)" stroke-width="3"/>`,
  hut: `<rect width="160" height="120" fill="var(--art-sky)"/>
    <path d="M0 80 30 40l18 22 22-36 26 38 18-20 46 36v40H0z" fill="var(--art-rock)"/>
    <path d="M70 26l9 13-9-4-7 4z" fill="var(--snow)"/>
    <path d="M0 92c40-8 90-6 160-12v40H0z" fill="var(--art-meadow)"/>
    <rect x="62" y="78" width="36" height="22" fill="var(--hut-wall)"/><path d="M56 80l24-16 24 16z" fill="var(--hut-roof)"/>`,
  alpaca: `<rect width="160" height="120" fill="var(--art-meadow-light)"/>
    <path d="M0 96c50-10 100-8 160-4v28H0z" fill="var(--art-meadow)"/>
    <g fill="var(--art-wool)">
      <ellipse cx="78" cy="74" rx="30" ry="18"/>
      <rect x="92" y="34" width="14" height="40" rx="7"/>
      <ellipse cx="102" cy="34" rx="12" ry="10"/>
      <rect x="56" y="82" width="7" height="22" rx="3"/><rect x="70" y="84" width="7" height="20" rx="3"/>
      <rect x="86" y="84" width="7" height="20" rx="3"/><rect x="98" y="82" width="7" height="22" rx="3"/>
      <path d="M96 24l3-10 4 9zM105 24l4-9 2 10z"/>
    </g>
    <circle cx="106" cy="33" r="2" fill="var(--art-dark)"/>`,
  lake: `<rect width="160" height="120" fill="var(--art-sky)"/>
    <path d="M0 70 26 34l20 18 26-30 24 28 18-14 46 34H0z" fill="var(--art-rock)"/>
    <ellipse cx="80" cy="92" rx="70" ry="16" fill="var(--art-water)"/>
    <path d="M30 92h30M90 96h36" stroke="var(--art-light)" stroke-width="2" opacity=".7"/>`,
  chapel: `<rect width="160" height="120" fill="var(--art-sky)"/>
    <path d="M0 96c50-8 100-8 160-6v30H0z" fill="var(--art-meadow)"/>
    <rect x="64" y="56" width="32" height="40" fill="var(--hut-wall)"/>
    <path d="M58 58l22-22 22 22z" fill="var(--hut-roof)"/>
    <path d="M80 14v20M73 21h14" stroke="var(--art-dark)" stroke-width="3"/>
    <path d="M74 96V78a6 6 0 0 1 12 0v18z" fill="var(--hut-roof)"/>`,
  dessert: `<rect width="160" height="120" fill="var(--art-warm)"/>
    <ellipse cx="80" cy="78" rx="56" ry="20" fill="var(--art-light)"/>
    <g fill="var(--art-crumb)"><rect x="52" y="62" width="16" height="12" rx="3" transform="rotate(-12 60 68)"/><rect x="72" y="58" width="18" height="13" rx="3" transform="rotate(8 81 64)"/><rect x="92" y="64" width="15" height="12" rx="3" transform="rotate(-6 99 70)"/><rect x="64" y="72" width="16" height="11" rx="3"/></g>
    <g fill="var(--snow)"><circle cx="62" cy="62" r="2"/><circle cx="84" cy="58" r="2"/><circle cx="100" cy="66" r="2"/><circle cx="74" cy="72" r="2"/></g>`,
};

export function artSVG(kind) {
  const body = scenes[kind] || scenes.hut;
  return `<svg class="art" viewBox="0 0 160 120" aria-hidden="true" focusable="false" data-art="${kind}">${body}</svg>`;
}
