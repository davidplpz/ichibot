import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SessionMessage, SessionSummary } from '@ichibot/shared';

export type StoredSession = {
  id: string;
  title: string;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
};

export type Store = {
  sessions: Record<string, StoredSession>;
};

const DATA_DIR = process.env.ICHIBOT_DATA_DIR ?? path.join(os.homedir(), '.ichibot');
const STORE_FILE = path.join(DATA_DIR, 'sessions.json');

function emptyStore(): Store {
  return { sessions: {} };
}

/** Lee el store una vez. Archivo inexistente o JSON corrupto → store vacío (nunca crashea el sidecar). */
export function loadStore(): Store {
  try {
    if (!existsSync(STORE_FILE)) return emptyStore();
    const raw = readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.sessions !== 'object' || !parsed.sessions) {
      return emptyStore();
    }
    return parsed as Store;
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: Store): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (error) {
    // Un fallo de escritura no debe tirar abajo el sidecar: se informa por stderr.
    console.error('[store] no se pudo guardar sessions.json:', error);
  }
}

export function listSessions(store: Store): SessionSummary[] {
  return Object.values(store.sessions)
    .map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(store: Store, id: string): StoredSession | undefined {
  return store.sessions[id];
}

export function createSession(store: Store): StoredSession {
  const now = Date.now();
  const session: StoredSession = {
    id: crypto.randomUUID(),
    title: '',
    messages: [],
    createdAt: now,
    updatedAt: now
  };
  store.sessions[session.id] = session;
  return session;
}

export function appendToSession(store: Store, id: string, message: SessionMessage): void {
  const session = store.sessions[id];
  if (!session) return;
  session.messages.push(message);
  session.updatedAt = Date.now();
}

export function updateTitleIfEmpty(store: Store, id: string, title: string): void {
  const session = store.sessions[id];
  if (!session || session.title) return;
  session.title = title;
  session.updatedAt = Date.now();
}

export function deleteSession(store: Store, id: string): boolean {
  if (!store.sessions[id]) return false;
  delete store.sessions[id];
  return true;
}
