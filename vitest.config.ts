import { defineConfig } from 'vitest/config';

// Its own config, so tests don't load vite.config.ts and its Electron plugin.
export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        // vi.stubEnv() changes are undone after each test.
        unstubEnvs: true,
    },
});
