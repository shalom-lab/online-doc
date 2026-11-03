import { readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root = resolve(process.argv[2] || 'dist');
function check(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) check(path);
    else if (stat.size > 25 * 1024 ** 2) throw new Error(`EdgeOne file exceeds 25 MiB: ${path}`);
  }
}
check(root);
console.log('PASS: all EdgeOne output files are within 25 MiB');
