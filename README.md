# danieljsmith.org

Landing hub for all DJS sites.

Built with [Astro](https://astro.build), [Tailwind CSS](https://tailwindcss.com) and one [Svelte](https://svelte.dev) island: the figure plate (`src/components/CurvePlate.svelte`), which draws from the curve library in `src/components/curves.ts`.

To list another site, add an entry to `sites` in `src/pages/index.astro`; the header, cards and footer all follow it.

The page shares the resources and tuition sites' editorial style (paper, Georgia headings, fine rules); its tokens and styles live in `src/styles/global.css`.

---

**Live** → [danieljsmith.org](https://danieljsmith.org)

**Subdomains**
- [tuition.danieljsmith.org](https://tuition.danieljsmith.org) — Tuition services
- [resources.danieljsmith.org](https://resources.danieljsmith.org) — Free study materials
