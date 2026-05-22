# Agent Instructions

This repository is a frontend application built with **SvelteKit (Svelte 5)**, **Tailwind CSS v4**, and **shadcn-svelte**.

## Architecture & Conventions

- **SvelteKit Adapter:** Uses `@sveltejs/adapter-node`. The application builds to `build/` and runs as a Node server (not a static SPA).
- **Styling (Tailwind v4):** Uses `@tailwindcss/vite`. There is no `tailwind.config.js` or `postcss.config.js`. Configuration is done via CSS variables in `src/app.css`. Do not attempt to create standard Tailwind v3 configuration files.
- **UI Components:** `shadcn-svelte` is initialized (`components.json`).
  - Use `npx shadcn-svelte@latest add <component>` to install new UI elements.
  - Aliases: `$lib/components/ui` maps to `ui`, `$lib/utils` maps to `utils`.
  - *Note:* The `src/lib` directory may not exist yet. Ensure it is created before adding components.
- **Deployment:** Deployment configuration is located in the `k8s/` directory. The included `Dockerfile` serves the production build on port `80` via `node build/index.js`. 

## Commands

- **Run Dev Server:** `npm run dev`
- **Typecheck & Lint:** `npm run check` (runs `svelte-kit sync`, `svelte-check`, and `tsc`). Always run this after making changes to types or Svelte components to verify correctness.
- **Build:** `npm run build`
