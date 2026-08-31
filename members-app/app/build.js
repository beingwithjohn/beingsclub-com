import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const output = path.join(root, 'members');
const api = process.argv.includes('--api')
  ? process.argv[process.argv.indexOf('--api') + 1]
  : 'https://practice-log.beingsclub.workers.dev';

fs.mkdirSync(path.join(output, 'host'), { recursive: true });
const page = (name) => fs.readFileSync(path.join(here, name), 'utf8').replaceAll('__API__', api);
fs.writeFileSync(path.join(output, 'index.html'), page('shell.html'));
fs.writeFileSync(path.join(output, 'host', 'index.html'), page('host.html'));
for (const file of ['app.css', 'app.js', 'host.js']) {
  fs.copyFileSync(path.join(here, file), path.join(output, file));
}
console.log(`members app → ${output} (${api})`);
