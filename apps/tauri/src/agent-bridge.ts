import { Command } from '@tauri-apps/plugin-shell';
import type { AgentEvent, ApprovalResponse } from '@ichibot/shared';

export type EH = (e: AgentEvent) => void;

export class AgentBridge {
  child: any = null;
  h: EH[] = [];
  buf = '';
  pendingConfig: Record<string, unknown> | null = null;
  onError: ((msg: string) => void) | null = null;

  async start() {
    if (this.child) return;
    // Detección de entorno: si no hay internals de Tauri, la página corre en un
    // navegador normal (p. ej. abriendo http://localhost:1420) y el sidecar no
    // puede existir. Mensaje claro en vez de un TypeError críptico.
    if (!('__TAURI_INTERNALS__' in window)) {
      this.onError?.(
        'No estás viendo la app en Tauri. Abrí la ventana que crea `pnpm dev` (o el binario del sistema), no localhost en el navegador.',
      );
      return null;
    }
    let cmd;
    try {
      cmd = Command.sidecar('binaries/agent');
    } catch (e) {
      console.error('[sidecar create error]', e);
      this.onError?.('No se pudo crear el sidecar: ' + String(e));
      return null;
    }
    cmd.stdout.on('data', (l: string) => {
      this.buf += l;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const c = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        if (c.trim()) this.line(c.trim());
      }
    });
    cmd.stderr.on('data', (l: string) => console.warn('[agent]', l));
    cmd.on('error', (e: any) => {
      console.error('[agent error]', e);
      this.onError?.('Sidecar (agente) no inició: ' + String(e));
    });
    cmd.on('close', () => {
      this.child = null;
    });
    try {
      this.child = await cmd.spawn();
      if (this.pendingConfig) {
        this.send({ type: 'set_config', config: this.pendingConfig });
      }
    } catch (e) {
      console.error('[agent spawn error]', e);
      this.onError?.('No se pudo iniciar el agente: ' + String(e));
      this.child = null;
      return null;
    }
    return this.child;
  }

  stop() {
    this.child?.kill();
    this.child = null;
  }

  onEvent(x: EH) {
    this.h.push(x);
  }

  offEvent(x: EH) {
    this.h = this.h.filter((v) => v !== x);
  }

  private line(l: string) {
    try {
      const e = JSON.parse(l) as AgentEvent;
      this.h.forEach((fn) => fn(e));
    } catch {}
  }

  sendChat(m: string) {
    this.send({ type: 'chat', message: m });
  }

  sendCancelChat() {
    this.send({ type: 'chat:cancel' });
  }

  sendSessionList() {
    this.send({ type: 'session:list' });
  }

  sendLoadSession(id: string) {
    this.send({ type: 'session:load', id });
  }

  sendDeleteSession(id: string) {
    this.send({ type: 'session:delete', id });
  }

  sendNewSession() {
    this.send({ type: 'session:new' });
  }

  sendApproval(r: ApprovalResponse) {
    this.send({ type: 'approval_response', response: r });
  }

  setConfig(c: Record<string, unknown>) {
    this.pendingConfig = { ...this.pendingConfig, ...c };
    this.send({ type: 'set_config', config: c });
  }

  private send(o: any) {
    if (!this.child) return;
    this.child.write(JSON.stringify(o) + '\n');
  }
}

export const agentBridge = new AgentBridge();
