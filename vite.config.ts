import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, since the built app is loaded from the file system.
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: 'electron/preload.ts',
        // Sandboxed preload scripts must be CommonJS, so give them a .cjs name.
        vite: {
          build: {
            rolldownOptions: {
              output: { entryFileNames: '[name].cjs' },
            },
          },
        },
      },
    }),
  ],
})
