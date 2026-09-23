import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs so the build works both at a GitHub Pages project path
  // (https://<owner>.github.io/<repo>/) and at a custom domain root.
  base: './',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  optimizeDeps: {
    // maplibre-gl spawns a Web Worker from a sibling file
    // (maplibre-gl-worker.mjs) via a relative URL computed at runtime.
    // Vite's dependency pre-bundler doesn't preserve that file, which
    // breaks the worker load with a MIME-type error — so load it as
    // native ESM from node_modules instead of pre-bundling it.
    exclude: ['maplibre-gl'],
  },
})
