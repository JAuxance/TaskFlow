import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// The Flask API of the development stack, or of the disposable test stack.
const backend = 'http://127.0.0.1:5000';

export default defineConfig({
    plugins: [vue()],
    server: {
        host: '127.0.0.1',
        port: 5173,
        // The backend only accepts this port: fail instead of moving to another one.
        strictPort: true,
        // style.css and its fonts stay in ../frontend while both frontends coexist.
        fs: { allow: ['..'] },
        // Same paths as the production Nginx, so the browser stays on one origin.
        proxy: {
            '/api': backend,
            '/static': backend,
            '/health': backend,
            '/socket.io': { target: backend, ws: true },
        },
    },
    test: {
        include: ['src/**/*.test.ts'],
    },
});
