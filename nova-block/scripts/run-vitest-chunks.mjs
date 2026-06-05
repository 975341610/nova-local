import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const testRoot = path.join(root, 'src', 'test');
const vitestCli = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');

function collectTests(dir) {
  const entries = readdirSync(dir).sort((a, b) => a.localeCompare(b));
  const tests = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      tests.push(...collectTests(fullPath));
      continue;
    }
    if (/\.test\.tsx?$/.test(entry)) {
      tests.push(path.relative(root, fullPath));
    }
  }
  return tests;
}

function parseArgs(argv) {
  const parsed = {
    chunkSize: 9,
    reporter: 'verbose',
    onlyChunk: null,
    extraVitestArgs: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--chunk-size') {
      parsed.chunkSize = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--chunk-size=')) {
      parsed.chunkSize = Number(arg.slice('--chunk-size='.length));
      continue;
    }
    if (arg === '--reporter') {
      parsed.reporter = argv[i + 1] || parsed.reporter;
      i += 1;
      continue;
    }
    if (arg.startsWith('--reporter=')) {
      parsed.reporter = arg.slice('--reporter='.length) || parsed.reporter;
      continue;
    }
    if (arg === '--only-chunk') {
      parsed.onlyChunk = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--only-chunk=')) {
      parsed.onlyChunk = Number(arg.slice('--only-chunk='.length));
      continue;
    }
    parsed.extraVitestArgs.push(arg);
  }

  if (!Number.isInteger(parsed.chunkSize) || parsed.chunkSize < 1) {
    throw new Error(`Invalid --chunk-size value: ${parsed.chunkSize}`);
  }
  if (
    parsed.onlyChunk !== null
    && (!Number.isInteger(parsed.onlyChunk) || parsed.onlyChunk < 1)
  ) {
    throw new Error(`Invalid --only-chunk value: ${parsed.onlyChunk}`);
  }

  return parsed;
}

const options = parseArgs(process.argv.slice(2));
const tests = collectTests(testRoot);
const totalChunks = Math.ceil(tests.length / options.chunkSize);

console.log(`[vitest:chunks] ${tests.length} test files, chunk size ${options.chunkSize}, ${totalChunks} chunks.`);

for (let index = 0; index < tests.length; index += options.chunkSize) {
  const chunk = tests.slice(index, index + options.chunkSize);
  const chunkNumber = Math.floor(index / options.chunkSize) + 1;
  if (options.onlyChunk !== null && chunkNumber !== options.onlyChunk) {
    continue;
  }
  const range = `${index + 1}-${index + chunk.length}`;
  console.log(`\n[vitest:chunks] Chunk ${chunkNumber}/${totalChunks} (${range})`);
  for (const test of chunk) {
    console.log(`  - ${test}`);
  }

  const result = spawnSync(
    process.execPath,
    [vitestCli, 'run', '--reporter', options.reporter, ...options.extraVitestArgs, ...chunk],
    {
      cwd: root,
      stdio: 'inherit',
      shell: false,
    },
  );

  if (result.status !== 0) {
    const exitCode = result.status ?? 1;
    console.error(`[vitest:chunks] Chunk ${chunkNumber}/${totalChunks} failed with exit code ${exitCode}.`);
    process.exit(exitCode);
  }
}

if (options.onlyChunk !== null && options.onlyChunk > totalChunks) {
  console.error(`[vitest:chunks] --only-chunk ${options.onlyChunk} is outside the available 1-${totalChunks} range.`);
  process.exit(1);
}

console.log(options.onlyChunk === null ? '\n[vitest:chunks] All chunks passed.' : `\n[vitest:chunks] Chunk ${options.onlyChunk}/${totalChunks} passed.`);
