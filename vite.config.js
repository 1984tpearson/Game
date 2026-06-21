import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base must match the repo name since GitHub Pages serves this site from
// https://<username>.github.io/Game/ rather than the domain root — without
// this, built asset paths (JS/CSS) would 404 just like the very first
// GitHub Pages attempt did.
export default defineConfig({
  plugins: [react()],
  base: '/Game/',
});
