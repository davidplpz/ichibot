import { Mochi, type Appearance } from './mochi';
import type { AgentEvent, ApprovalResponse } from '@ichibot/shared';
import { agentBridge } from './agent-bridge';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

const canvas = document.getElementById('mochi') as HTMLCanvasElement;
const thoughtEl = document.getElementById('thought') as HTMLDivElement;

const savedAppearance = localStorage.getItem('ichibot.appearance');
const initialAppearance: Appearance = ['mochi', 'face', 'face2', 'face3', 'face4'].includes(savedAppearance || '')
  ? (savedAppearance as Appearance)
  : 'face';
const mochi = new Mochi(canvas, initialAppearance);
let last = performance.now();

function loop(n: number) {
  const dt = Math.min(0.033, (n - last) / 1000);
  last = n;
  mochi.update(dt);
  mochi.draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function showThought(text: string) {
  if (!text) {
    thoughtEl.classList.remove('show');
    thoughtEl.classList.add('hidden');
    return;
  }
  thoughtEl.textContent = text;
  thoughtEl.classList.remove('hidden');
  requestAnimationFrame(() => thoughtEl.classList.add('show'));
}

function hideThought() {
  thoughtEl.classList.remove('show');
  setTimeout(() => thoughtEl.classList.add('hidden'), 160);
}

listen<ApprovalResponse>('ichibot:approval-response', (event) => {
  agentBridge.sendApproval(event.payload);
}).catch((e) => console.error('listen approval response', e));

agentBridge.onEvent((e: AgentEvent) => {
  // El overlay es el dueño del sidecar: reenvía TODO al chat vía eventos Tauri
  emit('ichibot:agent-event', e).catch(() => {});
  switch (e.type) {
    case 'state':
      mochi.setState(e.state);
      if (e.state === 'idle' || e.state === 'success' || e.state === 'error') hideThought();
      break;
    case 'thinking':
      mochi.setState('thinking');
      showThought(e.text || 'Pensando...');
      break;
    case 'tool_call':
      mochi.setState('tool_call');
      showThought(`Usando: ${e.payload.tool}`);
      break;
    case 'tool_result':
      hideThought();
      break;
    case 'needs_approval':
      mochi.setState('needs_approval');
      break;
    case 'response_chunk':
      mochi.setState('streaming');
      break;
    case 'response_complete':
      hideThought();
      setTimeout(() => mochi.setState('success'), 120);
      setTimeout(() => mochi.setState('idle'), 900);
      break;
    case 'error':
      hideThought();
      showThought(e.message.slice(0, 40));
      setTimeout(() => hideThought(), 1600);
      mochi.setState('error');
      setTimeout(() => mochi.setState('idle'), 900);
      break;
    case 'ready':
      mochi.setState('idle');
      break;
    default:
      break;
  }
});

agentBridge.onError = (msg: string) => {
  mochi.setState('error');
  showThought('sin agente: ' + msg.slice(0, 40));
  emit('ichibot:agent-event', { type: 'error', message: msg }).catch(() => {});
  setTimeout(() => hideThought(), 4000);
};

agentBridge.start().catch((e) => console.error('agent start', e));

// Contrato de los pedidos que manda la ventana chat. El overlay es el dueño
// del sidecar: traduce cada pedido en un mensaje JSONL hacia el agente.
type ChatRequest =
  | { type: 'chat'; message: string }
  | { type: 'chat:cancel' }
  | { type: 'session:list' }
  | { type: 'session:load'; id: string }
  | { type: 'session:delete'; id: string }
  | { type: 'config'; config: Record<string, unknown> }
  | { type: 'session:new' };

listen<ChatRequest>('ichibot:chat', (ev) => {
  const p = ev.payload;
  if (!p || typeof p !== 'object' || typeof p.type !== 'string') return;
  switch (p.type) {
    case 'chat': {
      const m = typeof p.message === 'string' ? p.message.trim() : '';
      if (m) agentBridge.sendChat(m);
      break;
    }
    case 'chat:cancel':
      agentBridge.sendCancelChat();
      break;
    case 'session:list':
      agentBridge.sendSessionList();
      break;
    case 'session:load':
      if (typeof p.id === 'string' && p.id) agentBridge.sendLoadSession(p.id);
      break;
    case 'session:delete':
      if (typeof p.id === 'string' && p.id) agentBridge.sendDeleteSession(p.id);
      break;
    case 'config':
      agentBridge.setConfig(p.config);
      break;
    case 'session:new':
      agentBridge.sendNewSession();
      break;
    default:
      break;
  }
}).catch((e) => console.error('listen chat', e));

listen<Appearance>('ichibot:appearance', (event) => {
  if (['mochi', 'face', 'face2', 'face3', 'face4'].includes(event.payload)) {
    mochi.setAppearance(event.payload);
    localStorage.setItem('ichibot.appearance', event.payload);
  }
}).catch((e) => console.error('listen appearance', e));

window.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const mx = (e.clientX - cx) / (r.width / 2);
  const my = (e.clientY - cy) / (r.height / 2);
  mochi.eyeX = Math.max(-1, Math.min(1, mx)) * 0.6;
  mochi.eyeY = Math.max(-1, Math.min(1, my)) * 0.4;
});

async function openChat() {
  invoke('toggle_chat')
    .then(() => {
      showThought('Abriendo chat...');
      setTimeout(() => hideThought(), 600);
    })
    .catch((e) => {
      showThought('no abre el chat: ' + String(e).slice(0, 40));
      setTimeout(() => hideThought(), 2500);
    });
}

// Arrastrar mueve la ventana nativa; un click corto sigue abriendo el chat.
let pointerStart: { x: number; y: number } | null = null;
let dragStarted = false;

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  pointerStart = { x: event.clientX, y: event.clientY };
  dragStarted = false;
});

canvas.addEventListener('pointermove', (event) => {
  if (!pointerStart || dragStarted) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  if (Math.hypot(dx, dy) < 5) return;
  dragStarted = true;
  getCurrentWindow().startDragging().catch((e) => console.error('drag overlay', e));
});

canvas.addEventListener('pointerup', () => {
  if (!pointerStart) return;
  const wasDragged = dragStarted;
  pointerStart = null;
  dragStarted = false;
  if (!wasDragged) openChat();
});
