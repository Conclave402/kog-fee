// Planted-bug check for kog-fee.
//
// The house rule is: every change ships with tests that fail without it, and the
// reviewer plants a bug and expects the tests to catch it. This script does the
// same to itself: for each entry in scripts/mutants.json it copies the repo to a
// scratch folder, applies exactly one bug, and requires the suite to fail.
//
//   node scripts/mutants.mjs            all mutants
//   node scripts/mutants.mjs ignore-owner   one or more ids
//
// Offline, no dependencies, nothing outside the OS temp folder is touched.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const only = process.argv.slice(2);

const COPIED = ['src', 'test', 'fixtures', 'index.js', 'package.json'];

function testFiles(dir) {
  return readdirSync(join(dir, 'test'))
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .map((name) => join('test', name));
}

function runSuite(dir) {
  return spawnSync(process.execPath, ['--test', ...testFiles(dir)], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 180_000,
  });
}

const mutants = JSON.parse(readFileSync(join(root, 'scripts', 'mutants.json'), 'utf8'))
  .filter((m) => only.length === 0 || only.includes(m.id));

if (mutants.length === 0) {
  console.error('no mutant matched', only.join(' '));
  process.exit(2);
}

const base = mkdtempSync(join(tmpdir(), 'kog-fee-mutants-'));

// Baseline first: the unmutated suite must pass, otherwise every result is noise.
const clean = join(base, '_baseline');
cpSync(root, clean, { recursive: true, filter: (src) => !src.includes(`${join(root, '.git')}`) });
const baseline = runSuite(clean);
if (baseline.status !== 0) {
  console.error('BASELINE FAILED, fix the suite before mutating');
  console.error(baseline.stdout || baseline.stderr);
  rmSync(base, { recursive: true, force: true });
  process.exit(1);
}

let caught = 0;
const survived = [];

for (const [index, mutant] of mutants.entries()) {
  const dir = join(base, `m${index}`);
  cpSync(root, dir, { recursive: true, filter: (src) => !src.includes(`${join(root, '.git')}`) });

  const file = join(dir, mutant.file);
  const before = readFileSync(file, 'utf8');
  const hits = before.split(mutant.find).length - 1;
  if (hits !== 1) {
    console.error(`MUTANT BAD: ${mutant.id} find string appears ${hits} times in ${mutant.file}`);
    survived.push({ id: mutant.id, note: `find string appears ${hits} times` });
    continue;
  }
  writeFileSync(file, before.replace(mutant.find, mutant.replace));

  const result = runSuite(dir);
  if (result.status === 0) {
    survived.push({ id: mutant.id, note: `suite still passed (expected ${mutant.caught_by})` });
    console.log(`SURVIVED ${mutant.id} -> ${mutant.why}`);
  } else {
    caught += 1;
    console.log(`caught   ${mutant.id} -> ${mutant.why} (${mutant.caught_by})`);
  }
  rmSync(dir, { recursive: true, force: true });
}

rmSync(base, { recursive: true, force: true });

console.log(`\n${caught} of ${mutants.length} planted bugs caught, ${survived.length} survived`);
if (survived.length > 0) {
  for (const s of survived) console.log(`  survived: ${s.id} (${s.note})`);
  process.exit(1);
}
