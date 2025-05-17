import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const testFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.ts'));
let failures = 0;
for (const file of testFiles) {
  const res = spawnSync('tsx', [path.join(__dirname, file)], { stdio: 'inherit' });
  if (res.status !== 0) failures++;
}
process.exit(failures);
