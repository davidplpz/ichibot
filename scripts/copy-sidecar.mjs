import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = os.arch() === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
const sourcePath = path.join(rootDir, 'apps', 'agent', 'dist', 'index.js');
const binariesDir = path.join(rootDir, 'apps', 'tauri', 'src-tauri', 'binaries');
const destinationPath = path.join(binariesDir, `agent-${target}`);

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Agent bundle not found at ${sourcePath}. Run the agent build first.`);
}

fs.mkdirSync(binariesDir, { recursive: true });
fs.copyFileSync(sourcePath, destinationPath);
fs.chmodSync(destinationPath, 0o755);
console.log(`sidecar -> ${destinationPath}`);
