// The Practice Log frontend moved to Space to Be. This command deliberately
// verifies the compatibility pages instead of rebuilding the retired Beings
// Club copy over them. The shared Worker remains in this directory because it
// also powers the Beings Club member experience.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const moves = [
  ['log/index.html', 'https://spacetobe.xyz/log/'],
  ['log/host/index.html', 'https://spacetobe.xyz/log/host/'],
];

for (const [path, destination] of moves) {
  const html = readFileSync(join(repo, path), 'utf8');
  if (!html.includes('<meta name="robots" content="noindex,follow">') ||
      !html.includes(`<link rel="canonical" href="${destination}">`) ||
      !html.includes(`href="${destination}"`)) {
    throw new Error(`${path} is not the generated move page to ${destination}; run python3 build/build_shell.py`);
  }
}

console.log('Practice Log frontend moved to https://spacetobe.xyz/log/');
