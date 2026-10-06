import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { AgentState } from '@ichibot/shared';
import { emit, requestApproval } from './events.js';
import {
  loadStore,
  saveStore,
  listSessions as storeListSessions,
  getSession,
  createSession,
  deleteSession,
  appendToSession,
  updateTitleIfEmpty
} from './store.js';
import type { Store } from './store.js';

const execFileAsync = promisify(execFile);
const SHELL_TIMEOUT_MS = 10_000;
const SHELL_MAX_OUTPUT = 20_000;

function isBlockedShellCommand(command: string) {
  return /\b(sudo|rm\s+-rf|mkfs(?:\.|\s)|diskutil\s+erase|shutdown|reboot|:\(\)\s*\{|git\s+reset\s+--hard)\b/i.test(command)
    || /curl[^|]*\|\s*(sh|bash|zsh)|wget[^|]*\|\s*(sh|bash|zsh)/i.test(command);
}

function safeShellEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/(API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name))
  );
}

export type Provider = 'claude' | 'openai' | 'opencode';
export type AuthMethod = 'apikey' | 'oauth' | 'opencode';

export interface AgentConfig {
  provider: Provider;
  authMethod: AuthMethod;
  model?: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
  claudeAccessToken?: string;
  openaiAccessToken?: string;
}

let currentState: AgentState = 'idle';

function setState(state: AgentState) {
  if (currentState === state) return;
  currentState = state;
  emit({ type: 'state', state });
}

function formatProviderError(error: unknown, config: AgentConfig) {
  const detail = error instanceof Error ? error.message : String(error);
  const safeDetail = detail.replace(/\b(sk-[A-Za-z0-9_-]{12,}|sk-ant-[A-Za-z0-9_-]{12,})\b/g, '[API key oculta]');
  const provider = config.provider === 'openai' ? 'OpenAI' : 'Claude';
  const lower = safeDetail.toLowerCase();
  let friendly = 'La API devolvió un error inesperado.';
  if (/401|unauthorized|invalid.*(api )?key|authentication/.test(lower)) {
    friendly = `La API key de ${provider} no es válida o no se ha recibido.`;
  } else if (/403|forbidden|permission|access denied/.test(lower)) {
    friendly = `La cuenta no tiene permiso para usar ${provider} o este modelo.`;
  } else if (/404|not found|model.*(not|doesn't).*exist/.test(lower)) {
    friendly = `El modelo ${config.model || 'seleccionado'} no está disponible para esta cuenta.`;
  } else if (/429|rate.?limit|quota|too many requests|billing/.test(lower)) {
    friendly = `Se ha alcanzado el límite o la cuota de ${provider}.`;
  } else if (/timeout|timed out|network|fetch failed|connection|econn/.test(lower)) {
    friendly = `No se pudo conectar con ${provider}. Comprueba tu conexión e inténtalo de nuevo.`;
  } else if (/overloaded|capacity|temporarily unavailable|503/.test(lower)) {
    friendly = `${provider} está temporalmente saturado. Inténtalo de nuevo en unos segundos.`;
  }
  return `${friendly}\n\nDetalle: ${provider} (${config.model || 'modelo predeterminado'}): ${safeDetail}`;
}

export class IchibotAgent {
  private config: AgentConfig;
  private store: Store;
  private activeSessionId: string;
  private activeAbortController: AbortController | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.store = loadStore();
    // El arranque SIEMPRE empieza una conversación nueva; las viejas quedan en la lista.
    this.activeSessionId = createSession(this.store).id;
  }

  updateConfig(partial: Partial<AgentConfig>) {
    this.config = { ...this.config, ...partial };
  }

  getState(): AgentState {
    return currentState;
  }

  cancelChat() {
    this.activeAbortController?.abort();
  }

  private getLanguageModel() {
    const { provider, model } = this.config;
    if (provider === 'claude') {
      const key = this.config.claudeApiKey || this.config.claudeAccessToken;
      if (!key) throw new Error('Claude: falta la API key. Poné ANTHROPIC_API_KEY (o ICHIBOT_CLAUDE_API_KEY) en el .env del proyecto o exportala antes de pnpm dev.');
      return createAnthropic({ apiKey: key })(model || 'claude-sonnet-4-5-20250929');
    }
    if (provider === 'openai') {
      const key = this.config.openaiApiKey || this.config.openaiAccessToken;
      if (!key) throw new Error('OpenAI: falta la API key. Poné OPENAI_API_KEY (o ICHIBOT_OPENAI_API_KEY) en el .env del proyecto o exportala antes de pnpm dev.');
      // Ichibot usa mensajes y herramientas en formato Chat Completions.
      // El invocador por defecto del proveedor v2 usa Responses API, que
      // puede producir un stream vacío con este flujo de herramientas.
      return createOpenAI({ apiKey: key }).chat(model || 'gpt-4o-mini');
    }
    throw new Error('Provider ' + provider + ': todavía no soportado en este paso.');
  }

  private getActiveSession() {
    if (!this.activeSessionId) return undefined;
    return getSession(this.store, this.activeSessionId);
  }

  listSessions() {
    emit({ type: 'session_list', sessions: storeListSessions(this.store) });
  }

  loadSession(id: string) {
    const session = getSession(this.store, id);
    if (!session) {
      emit({ type: 'error', message: `No existe la sesión "${id}". Pedí la lista de nuevo con session:list.` });
      return;
    }
    this.activeSessionId = id;
    emit({ type: 'session_loaded', id, messages: session.messages.slice() });
  }

  newSession() {
    const session = createSession(this.store);
    saveStore(this.store);
    this.activeSessionId = session.id;
    emit({ type: 'session_new', id: session.id });
  }

  deleteSession(id: string) {
    if (!deleteSession(this.store, id)) {
      emit({ type: 'error', message: `No existe la sesión "${id}".` });
      return;
    }
    let replacement = this.getActiveSession();
    if (this.activeSessionId === id || !replacement) {
      replacement = createSession(this.store);
      this.activeSessionId = replacement.id;
    }
    saveStore(this.store);
    emit({
      type: 'session_deleted',
      id,
      replacement: {
        id: replacement.id,
        title: replacement.title,
        updatedAt: replacement.updatedAt,
        messageCount: replacement.messages.length
      }
    });
    // Reenvía la fuente completa de verdad para que las ventanas que se
    // hayan perdido el evento incremental queden sincronizadas igualmente.
    this.listSessions();
  }

  async chat(message: string) {
    const session = this.getActiveSession();
    if (!session) {
      emit({ type: 'error', message: 'No hay una sesión activa. Creá una conversación nueva.' });
      return;
    }
    // La sesión activa puede cambiar mientras streamea: el turno se le asigna
    // a la sesión que estaba activa cuando empezó.
    const sessionId = session.id;
    try {
      // Persisto el mensaje del usuario ANTES de llamar al modelo.
      appendToSession(this.store, sessionId, { role: 'user', content: message });
      if (!session.title && session.messages.length === 1) {
        updateTitleIfEmpty(this.store, sessionId, message.trim().slice(0, 40));
      }
      saveStore(this.store);

      setState('thinking');
      emit({ type: 'thinking', text: 'Pensando...' });

      // Historial completo de la sesión. El system prompt va SIEMPRE aparte,
      // nunca como mensaje dentro del array.
      const history = session.messages.map((m) =>
        m.role === 'user'
          ? { role: 'user' as const, content: m.content }
          : { role: 'assistant' as const, content: m.content }
      );

      const abortController = new AbortController();
      this.activeAbortController = abortController;
      const result = streamText({
        model: this.getLanguageModel(),
        abortSignal: abortController.signal,
        system: `Eres Ichibot, un agente con personalidad de mascota.

Eres curioso, directo, cálido y conciso. Responde siempre en español de España, con un registro natural y claro. Evita expresiones rioplatenses como "sos", "decile" o "poné".

Reglas:
- Responde corto por defecto. Amplía solo si te lo piden.
- Si una herramienta puede darte una respuesta fiable, úsala antes de contestar o hacer una suposición.
- Para preguntas sobre la fecha u hora actuales, usa get_current_datetime; nunca inventes esos datos.
- Usa herramientas cuando tenga sentido y NUNCA ejecutes acciones peligrosas sin aprobación.
- Explica brevemente lo que estás haciendo cuando uses una herramienta.
- Sé un compañero útil, no un oráculo verboso.`,
        messages: history,
        stopWhen: stepCountIs(10),
        tools: {
          read_file: tool({
            description: 'Leer un archivo de texto (ruta absoluta)',
            inputSchema: z.object({ path: z.string().describe('Ruta absoluta al archivo') }),
            execute: async ({ path }) => {
              setState('tool_call');
              emit({ type: 'tool_call', payload: { tool: 'read_file', args: { path } } });
              try {
                const { readFile } = await import('node:fs/promises');
                const content = await readFile(path, 'utf-8');
                setState('tool_result');
                emit({ type: 'tool_result', payload: { tool: 'read_file', result: content.slice(0, 2000) } });
                return content.slice(0, 5000);
              } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                setState('tool_result');
                emit({ type: 'tool_result', payload: { tool: 'read_file', error: msg } });
                throw error;
              }
            }
          }),
          get_current_datetime: tool({
            description: 'Obtener la fecha y hora actuales con una fuente local fiable. Úsala cuando el usuario pregunte qué día es, la fecha, la hora o el día de la semana.',
            inputSchema: z.object({
              timezone: z.enum(['Europe/Madrid', 'UTC']).default('Europe/Madrid')
            }),
            execute: async ({ timezone }) => {
              setState('tool_call');
              emit({ type: 'tool_call', payload: { tool: 'get_current_datetime', args: { timezone } } });
              const value = new Intl.DateTimeFormat('es-ES', {
                timeZone: timezone,
                dateStyle: 'full',
                timeStyle: 'long'
              }).format(new Date());
              setState('tool_result');
              emit({ type: 'tool_result', payload: { tool: 'get_current_datetime', result: value } });
              return value;
            }
          }),
          run_shell: tool({
            description: 'Ejecutar un comando shell en el directorio del proyecto (requiere aprobación explícita; los comandos destructivos están bloqueados)',
            inputSchema: z.object({ command: z.string().describe('Comando a ejecutar') }),
            execute: async ({ command }) => {
              setState('needs_approval');
              const approval = await requestApproval({
                id: crypto.randomUUID(),
                title: 'Ejecutar comando shell',
                description: `Voy a ejecutar:\n\`${command}\``,
                tool: 'run_shell',
                args: { command },
                risk: command.includes('rm') || command.includes('sudo') ? 'high' : 'medium',
                options: [
                  { label: 'Permitir', value: 'allow' },
                  { label: 'Denegar', value: 'deny' },
                  { label: 'Permitir siempre este tipo', value: 'always' }
                ]
              });
              if (approval.decision === 'deny') {
                setState('tool_result');
                emit({ type: 'tool_result', payload: { tool: 'run_shell', error: 'Aprobación denegada por el usuario' } });
                return 'Comando denegado por el usuario';
              }
              if (isBlockedShellCommand(command)) {
                setState('tool_result');
                const message = 'Comando bloqueado por seguridad: contiene una operación destructiva o una instalación remota no permitida.';
                emit({ type: 'tool_result', payload: { tool: 'run_shell', error: message } });
                return message;
              }
              setState('tool_call');
              emit({ type: 'tool_call', payload: { tool: 'run_shell', args: { command } } });
              try {
                const result = await execFileAsync('/bin/zsh', ['-lc', command], {
                  cwd: process.env.ICHIBOT_WORKSPACE || process.cwd(),
                  env: safeShellEnvironment(),
                  timeout: SHELL_TIMEOUT_MS,
                  maxBuffer: SHELL_MAX_OUTPUT
                });
                const output = [result.stdout, result.stderr ? `stderr:\n${result.stderr}` : '']
                  .filter(Boolean)
                  .join('\n')
                  .slice(0, SHELL_MAX_OUTPUT);
                setState('tool_result');
                emit({ type: 'tool_result', payload: { tool: 'run_shell', result: output || '(sin salida)' } });
                return output || '(sin salida)';
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                setState('tool_result');
                emit({ type: 'tool_result', payload: { tool: 'run_shell', error: message.slice(0, SHELL_MAX_OUTPUT) } });
                return `El comando falló: ${message.slice(0, SHELL_MAX_OUTPUT)}`;
              }
            }
          })
        }
      });

      setState('streaming');
      let fullText = '';
      for await (const chunk of result.textStream) {
        fullText += chunk;
        emit({ type: 'response_chunk', text: chunk });
      }
      // Persisto la respuesta completa en la sesión que originó el turno.
      appendToSession(this.store, sessionId, { role: 'assistant', content: fullText });
      saveStore(this.store);
      setState('success');
      emit({ type: 'response_complete', text: fullText, sessionId });
      setState('idle');
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || this.activeAbortController?.signal.aborted)) {
        emit({ type: 'response_cancelled', sessionId });
        setState('idle');
        return;
      }
      const message = formatProviderError(error, this.config);
      setState('error');
      emit({ type: 'error', message });
      setState('idle');
    } finally {
      this.activeAbortController = null;
    }
  }
}
