import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(
  new URL(
    '../node_modules/vinext/dist/server/app-rsc-cache-busting.js',
    import.meta.url,
  ),
);

const vulnerable = `async function sha256CacheBustingHash(input) {
\tconst digest = await globalThis.crypto.subtle.digest("SHA-256", textEncoder.encode(input));
\treturn encodeBase64Url(new Uint8Array(digest).subarray(0, CACHE_BUSTING_DIGEST_BYTES));
}`;

const patched = `async function sha256CacheBustingHash(input) {
\tconst subtle = globalThis.crypto?.subtle;
\tif (!subtle) return fnv1a64(input);
\tconst digest = await subtle.digest("SHA-256", textEncoder.encode(input));
\treturn encodeBase64Url(new Uint8Array(digest).subarray(0, CACHE_BUSTING_DIGEST_BYTES));
}`;

const source = await readFile(target, 'utf8');

if (source.includes(patched)) {
  console.log('Vinext Web Crypto compatibility patch already applied.');
} else if (source.includes(vulnerable)) {
  await writeFile(target, source.replace(vulnerable, patched));
  console.log('Applied Vinext Web Crypto compatibility patch.');
} else {
  throw new Error(
    'Vinext cache-busting implementation changed; review whether the compatibility patch is still required.',
  );
}
