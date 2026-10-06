import { createInterface } from 'node:readline';
import { IchibotAgent } from './agent.js';
import { resolveApproval, emit } from './events.js';
import { loadEnv } from './env.js';
import type { ApprovalResponse } from '@ichibot/shared';

// Antes de leer cualquier config: cargar .env (no pisa variables exportadas)
loadEnv();

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

const agent = new IchibotAgent({
  provider: 'claude',
  authMethod: 'apikey',
  claudeApiKey: process.env.ICHIBOT_CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.ICHIBOT_OPENAI_API_KEY || process.env.OPENAI_API_KEY
});

emit({ type: 'ready' });
// El chat arranca pidiendo el historial: le mandamos la lista apenas está listo.
agent.listSessions();

rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line.trim());
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'chat':
        if (typeof msg.message === 'string') {
          agent.chat(msg.message).catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            emit({ type: 'error', message });
          });
        }
        break;
      case 'chat:cancel':
        agent.cancelChat();
        break;
      case 'set_config':
        if (msg.config && typeof msg.config === 'object') {
          agent.updateConfig(msg.config);
        }
        break;
      case 'session:list':
        agent.listSessions();
        break;
      case 'session:load':
        if (typeof msg.id === 'string') {
          agent.loadSession(msg.id);
        }
        break;
      case 'session:new':
        agent.newSession();
        break;
      case 'session:delete':
        if (typeof msg.id === 'string') {
          agent.deleteSession(msg.id);
        }
        break;
      case 'approval_response':
        const res = msg.response as ApprovalResponse;
        if (res && res.id && res.decision) {
          resolveApproval(res);
        }
        break;
      default:
        break;
    }
  } catch (e) {}
});

rl.on('close', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
