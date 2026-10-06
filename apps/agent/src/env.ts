import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Carga un .env simple (KEY=VALUE, comentarios con #) sin dependencias.
 * Prioridad: las variables YA definidas en el entorno (export) ganan.
 * Busca .env en: cwd, la carpeta del binario, y subiendo hasta 6 niveles.
 */
export function loadEnv() {
  const candidates = new Set<string>();
  candidates.add(resolve(process.cwd(), '.env'));
  try {
    candidates.add(resolve(dirname(fileURLToPath(import.meta.url)), '.env'));
  } catch {
    // bundle no ESM: ignorar
  }
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    candidates.add(join(dir, '.env'));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    parseEnv(readFileSync(path, 'utf8'));
  }
}

function parseEnv(contents: string) {
  for (const raw of contents.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}