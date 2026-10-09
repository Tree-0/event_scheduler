import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const key = /export const DEV_KEY = '([^']+)'/.exec(config)?.[1];
if (!key) throw new Error('Development public key was not found.');
const bytes = createHash('sha256').update(Buffer.from(key, 'base64')).digest().subarray(0, 16);
console.log([...bytes].map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join(''));
