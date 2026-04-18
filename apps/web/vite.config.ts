import { fileURLToPath } from 'node:url';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import oxlintPlugin from 'vite-plugin-oxlint';

const oxlintPath = fileURLToPath(new URL('../../node_modules/.bin/oxlint', import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    oxlintPlugin({
      configFile: 'oxlint.config.ts',
      failOnError: true,
      oxlintPath,
    }),
  ],
});
