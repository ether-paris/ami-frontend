npm install -D @sveltejs/kit @sveltejs/adapter-static

mkdir -p src/routes
mv src/App.svelte src/routes/+page.svelte
rm index.html src/main.ts src/vite-env.d.ts || true
rm -rf src/assets src/lib || true

cat << 'INNER_EOF' > svelte.config.js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter({
            fallback: 'index.html'
        })
    }
};
export default config;
INNER_EOF

cat << 'INNER_EOF' > vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [sveltekit()]
});
INNER_EOF

cat << 'INNER_EOF' > src/app.html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
INNER_EOF

cat << 'INNER_EOF' > src/routes/+layout.ts
import '../app.css';
export const prerender = true;
export const ssr = false;
INNER_EOF

cat << 'INNER_EOF' > src/app.d.ts
declare global {
    namespace App {}
}
export {};
INNER_EOF

sed -i '' 's|import "./app.css";||g' src/routes/+page.svelte
sed -i '' 's|/app/dist|/app/build|g' Dockerfile

