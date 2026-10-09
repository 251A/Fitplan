// Generates a new random sync token, stores it as the Worker secret SYNC_TOKEN and saves a copy
// in private/sync-token.txt (git-ignored). Run: npm run sync:token
//
// The secret goes through a temporary file (`wrangler secret bulk`) instead of stdin: piping stdin
// makes wrangler think it runs non-interactively and it then ignores the `wrangler login` session.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const token = randomBytes(24).toString('base64url'); // 32 chars, 192 bits
const tmp = 'private/.sync-secret.tmp.json';

mkdirSync('private', { recursive: true });
writeFileSync(tmp, JSON.stringify({ SYNC_TOKEN: token }));
let r;
try {
  r = spawnSync('npx', ['wrangler', 'secret', 'bulk', tmp, '-c', 'worker/wrangler.jsonc'], {
    stdio: 'inherit',
    shell: true,
  });
} finally {
  rmSync(tmp, { force: true });
}
if (r.status !== 0) {
  console.error('\nNo se pudo guardar el secreto en Cloudflare. Si dice que no has iniciado sesión, ejecuta: npx wrangler login');
  process.exit(1);
}

writeFileSync('private/sync-token.txt', token + '\n');
console.log('\nClave de sincronización guardada en Cloudflare y en private/sync-token.txt');
console.log('Ábrela, cópiala y pégala en FitPlan → Ajustes → Sincronización (en cada dispositivo) y en el atajo.');
