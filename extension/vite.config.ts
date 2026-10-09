import { defineConfig, loadEnv, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { staticSolverProtobuf } from './build/solver-protobuf.ts';

export const DEV_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmZOj+od6ZZVtqz/tyx2IOox2WEnnK61x1ufWpCqRC2eCqRa65Nv8X9JrYKBUWu+LgoqvEorgsUJeZKX3siFppjrnCQwqdESxAq4b8vw21jk///lj3QfNDzX7fBX4CeXLirLUwYU50716rbdtlL2nwzzMDKzSykPguO8O1mcvTy3nHZecfqASOTlu3eaAX8vBLX80fqoo5zcLvdatRtIIQtZlKPCU8SAeD+i/u4qUjt4yUcBoKMGMc36xGqIlfD/QW7XoK7alr2es/yL9U+JnyDYtTXY7odUKPTwXYbnsnMUqvAJ1G60qKTmdufZmqtGD4E5a0DzfS7yRRwuRYFtpSwIDAQAB';

// Upstream's generic runtime table references every solver. Package only CP-SAT.
// This transform is checked by the browser tests and never alters node_modules.
export function cpSatAssets(): Plugin {
  return { name: 'cp-sat-assets-only', enforce: 'pre', transform(code, id) {
    if (!id.includes('/or-tools-wasm/') || !id.includes('/browser/')) return;
    const start = code.indexOf('var runtimeAssets = {');
    if (start < 0) return;
    const end = code.indexOf('\n};', start);
    if (end < 0) throw new Error('OR-Tools runtime table changed; review asset bundling.');
    const table = code.slice(start, end + 3);
    const next = table.indexOf('\n  routing_runtime:');
    if (next < 0) throw new Error('OR-Tools CP-SAT assets not found.');
    return code.slice(0, start) + table.slice(0, next).replace(/,\s*$/, '') + '\n};' + code.slice(end + 3);
  } };
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './', plugins: [cpSatAssets(), staticSolverProtobuf(), { name: 'manifest', generateBundle(_options, bundle) {
      // Vite may discover unused runtime URLs before tree shaking dependency code.
      for (const file of Object.keys(bundle)) if (/\/(routing|mp_solver|mathopt|pdlp|graph|set_cover)_runtime/.test(file)) delete bundle[file];
      for (const [name, path] of [['OR-Tools-WASM', 'node_modules/or-tools-wasm/LICENSE'], ['Temporal', 'node_modules/@js-temporal/polyfill/LICENSE'], ['protobufjs', 'node_modules/protobufjs/LICENSE']]) {
        this.emitFile({ type: 'asset', fileName: `licenses/${name}.txt`, source: readFileSync(resolve(path), 'utf8') });
      }
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify({
        manifest_version: 3, name: 'Calendar Window Scheduler', version: '0.1.0', minimum_chrome_version: '116',
        description: 'Draw availability windows and schedule flexible events using shared resources.', key: DEV_KEY,
        permissions: ['identity', 'storage', 'sidePanel', 'tabs'],
        host_permissions: ['https://calendar.google.com/*', 'https://www.googleapis.com/*'],
        oauth2: { client_id: env.GOOGLE_CLIENT_ID || 'configure-client-id.apps.googleusercontent.com', scopes: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'] },
        background: { service_worker: 'background.js', type: 'module' },
        action: { default_title: 'Open Window Scheduler' }, side_panel: { default_path: 'panel.html' },
        content_scripts: [{ matches: ['https://calendar.google.com/*'], js: ['content.js'] }],
        // MV3 requires extension workers to use packaged URLs. The solver and
        // OR-Tools pthread loader already do this; no blob: permission is needed.
        content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self'" },
        cross_origin_opener_policy: { value: 'same-origin' }, cross_origin_embedder_policy: { value: 'require-corp' },
      }, null, 2) });
    } }],
    worker: { format: 'es' as const, plugins: () => [cpSatAssets(), staticSolverProtobuf()] },
    build: { target: 'es2022', assetsInlineLimit: 0, rolldownOptions: {
      input: { panel: resolve('panel.html'), check: resolve('solver-check.html'), background: resolve('src/background.ts') },
      output: { entryFileNames: chunk => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js' },
    } },
    test: { include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
  };
});
