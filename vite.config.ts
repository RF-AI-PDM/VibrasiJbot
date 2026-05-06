import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three';
          }

          if (id.includes('node_modules/@supabase')) {
            return 'supabase';
          }

          return undefined;
        },
      },
    },
  },
  // server: {
  //   host: '0.0.0.0',
  // },
  // preview: {
  //   host: '0.0.0.0',
  // },
});
