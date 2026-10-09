// Generates a new random sync token, stores it as the Worker secret SYNC_TOKEN and saves a copy
// in private/sync-token.txt (git-ignored). Run: npm run sync:token
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const token = randomBytes(24).toString('base64url'); // 32 chars, 192 bits

const r = spawnSync('npx', ['wrangler', 'secret', 'put', 'SYNC_TOKEN', '-c', 'worker/wrangler.jsonc'], {
  input: token,
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true,
});
if (r.status !== 0) {
  console.error('\nNo se pudo guardar el secreto en Cloudflare.');
  process.exit(1);
}

mkdirSync('private', { recursive: true });
writeFileSync('private/sync-token.txt', token + '\n');
console.log('\nClave de sincronización guardada en Cloudflare y en private/sync-token.txt');
console.log('Ábrela, cópiala y pégala en FitPlan → Ajustes → Sincronización (en cada dispositivo) y en el atajo.');
