import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const testDir = join(root, 'tests');
const files = (await readdir(testDir))
  .filter((file) => file.endsWith('.test.mjs'))
  .sort();

for (const file of files) {
  await import(pathToFileURL(join(testDir, file)).href);
}
