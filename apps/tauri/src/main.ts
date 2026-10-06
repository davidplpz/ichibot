import './styles.css';
import type { AgentEvent, SessionMessage, SessionSummary } from '@ichibot/shared';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

const form = document.getElementById('input-form') as HTMLFormElement;
const input = document.getElementById('input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send') as HTMLButtonElement;
const messagesEl = document.getElementById('messages') as HTMLDivElement;
const providerEl = document.getElementById('provider') as HTMLDivElement;
const companionStatus = document.getElementById('companion-status') as HTMLElement;
const providerSelect = document.getElementById('provider-select') as HTMLSelectElement;
const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
const apiKeySettings = document.getElementById('api-key-settings') as HTMLButtonElement;
const apiKeyModal = document.getElementById('api-key-modal') as HTMLDivElement;
const claudeApiKeyInput = document.getElementById('claude-api-key') as HTMLInputElement;
const openaiApiKeyInput = document.getElementById('openai-api-key') as HTMLInputElement;
const apiKeyCancel = document.getElementById('api-key-cancel') as HTMLButtonElement;
const apiKeySave = document.getElementById('api-key-save') as HTMLButtonElement;
const apiKeyDelete = document.getElementById('api-key-delete') as HTMLButtonElement;
const appearanceSettings = document.getElementById('appearance-settings') as HTMLButtonElement;
const appearanceModal = document.getElementById('appearance-modal') as HTMLDivElement;
const appearanceGrid = document.getElementById('appearance-grid') as HTMLDivElement;
const appearanceCancel = document.getElementById('appearance-cancel') as HTMLButtonElement;
const sidebarListEl = document.getElementById('sidebar-list') as HTMLDivElement;
const newSessionBtn = document.getElementById('new-session') as HTMLButtonElement;
const approvalModal = document.getElementById('approval-modal') as HTMLDivElement;
const approvalTitle = document.getElementById('approval-title') as HTMLHeadingElement;
const approvalDescription = document.getElementById('approval-description') as HTMLParagraphElement;
const approvalDeny = document.getElementById('approval-deny') as HTMLButtonElement;
const approvalAlways = document.getElementById('approval-always') as HTMLButtonElement;
const approvalAllow = document.getElementById('approval-allow') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancel') as HTMLButtonElement;

let bridgeReady = false;

// Estado local: la conversación abierta + el historial del sidebar
let messages: SessionMessage[] = [];
let sessions: SessionSummary[] = [];
let activeSessionId: string | null = null;
let streamingBubble: HTMLDivElement | null = null;
let pendingApprovalId: string | null = null;
let lastUserMessage: string | null = null;

const storedKeys: {
  claudeApiKey?: string;
  openaiApiKey?: string;
} = {};

const legacyKeys = (() => {
  try {
    return JSON.parse(localStorage.getItem('ichibot.apiKeys') || '{}') as {
      claudeApiKey?: string;
      openaiApiKey?: string;
    };
  } catch {
    return {};
  }
})();

const modelsByProvider: Record<string, Array<{ value: string; label: string }>> = {
  claude: [
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
    { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
    { value: 'claude-3-5-haiku-20241022', label: 'Haiku 3.5' }
  ],
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { value: 'gpt-5-mini', label: 'GPT-5 mini' },
    { value: 'gpt-5', label: 'GPT-5' },
  ]
};

const savedModelSettings = (() => {
  try {
    return JSON.parse(localStorage.getItem('ichibot.modelSettings') || '{}') as {
      provider?: string;
      model?: string;
    };
  } catch {
    return {};
  }
})();

function renderModelOptions() {
  const models = modelsByProvider[providerSelect.value] || [];
  modelSelect.replaceChildren(
    ...models.map((model) => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = model.label;
      return option;
    })
  );
}

function selectedModelLabel() {
  return modelSelect.options[modelSelect.selectedIndex]?.textContent || modelSelect.value;
}

function restoreModelSettings() {
  if (savedModelSettings.provider && modelsByProvider[savedModelSettings.provider]) {
    providerSelect.value = savedModelSettings.provider;
  }
  renderModelOptions();
  if (savedModelSettings.model && Array.from(modelSelect.options).some((option) => option.value === savedModelSettings.model)) {
    modelSelect.value = savedModelSettings.model;
  }
}

function sendProviderConfig() {
  localStorage.setItem('ichibot.modelSettings', JSON.stringify({
    provider: providerSelect.value,
    model: modelSelect.value
  }));
  providerEl.classList.remove('provider-error');
  providerEl.textContent = `${providerSelect.value === 'openai' ? 'OpenAI' : 'Claude'} • ${selectedModelLabel()}`;
  emit('ichibot:chat', {
    type: 'config',
    config: {
      provider: providerSelect.value,
      model: modelSelect.value,
      claudeApiKey: storedKeys.claudeApiKey,
      openaiApiKey: storedKeys.openaiApiKey
    }
  }).catch(() => {});
}

restoreModelSettings();

function closeApiKeyModal() {
  apiKeyModal.classList.remove('show');
  apiKeyModal.setAttribute('aria-hidden', 'true');
  setTimeout(() => apiKeyModal.classList.add('hidden'), 160);
}

apiKeySettings.addEventListener('click', () => {
  claudeApiKeyInput.value = '';
  openaiApiKeyInput.value = '';
  apiKeyModal.classList.remove('hidden');
  apiKeyModal.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => apiKeyModal.classList.add('show'));
});

apiKeyCancel.addEventListener('click', closeApiKeyModal);
apiKeySave.addEventListener('click', () => {
  const claudeApiKey = claudeApiKeyInput.value.trim();
  const openaiApiKey = openaiApiKeyInput.value.trim();
  invoke('save_api_keys', {
    claude_api_key: claudeApiKey || null,
    openai_api_key: openaiApiKey || null
  })
    .then(() => {
      if (claudeApiKey) storedKeys.claudeApiKey = claudeApiKey;
      if (openaiApiKey) storedKeys.openaiApiKey = openaiApiKey;
      sendProviderConfig();
      closeApiKeyModal();
    })
    .catch((error) => {
      addMsg('assistant', 'No se pudieron guardar las claves en el Llavero de macOS: ' + String(error));
    });
});

apiKeyDelete.addEventListener('click', () => {
  if (!window.confirm('¿Borrar las claves de Claude y OpenAI del Llavero de macOS?')) return;
  invoke('delete_api_keys')
    .then(() => {
      delete storedKeys.claudeApiKey;
      delete storedKeys.openaiApiKey;
      closeApiKeyModal();
      addMsg('assistant', 'Se han borrado las claves del Llavero de macOS.');
    })
    .catch((error) => addMsg('assistant', 'No se pudieron borrar las claves: ' + String(error)));
});

const appearances = [
  { value: 'mochi', label: 'Mochi', image: null },
  { value: 'face', label: 'Ichibot face', image: '/avatars/face.png' },
  { value: 'face2', label: 'Ichibot face 2', image: '/avatars/face2.png' },
  { value: 'face3', label: 'Ichibot face 3', image: '/avatars/face3.png' },
  { value: 'face4', label: 'Ichibot face 4', image: '/avatars/face4.png' }
];

function closeAppearanceModal() {
  appearanceModal.classList.remove('show');
  appearanceModal.setAttribute('aria-hidden', 'true');
  setTimeout(() => appearanceModal.classList.add('hidden'), 160);
}

function renderAppearanceChoices() {
  const selected = localStorage.getItem('ichibot.appearance') || 'face';
  appearanceGrid.replaceChildren(...appearances.map((appearance) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'appearance-choice' + (appearance.value === selected ? ' selected' : '');
    button.title = appearance.label;
    if (appearance.image) {
      const image = document.createElement('img');
      image.src = appearance.image;
      image.alt = appearance.label;
      button.appendChild(image);
    } else {
      const mochiPreview = document.createElement('span');
      mochiPreview.className = 'mochi-preview';
      mochiPreview.textContent = 'M';
      button.appendChild(mochiPreview);
    }
    const label = document.createElement('span');
    label.textContent = appearance.label;
    button.appendChild(label);
    button.addEventListener('click', () => {
      localStorage.setItem('ichibot.appearance', appearance.value);
      emit('ichibot:appearance', appearance.value).catch(() => {});
      renderAppearanceChoices();
    });
    return button;
  }));
}

appearanceSettings.addEventListener('click', () => {
  renderAppearanceChoices();
  appearanceModal.classList.remove('hidden');
  appearanceModal.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => appearanceModal.classList.add('show'));
});
appearanceCancel.addEventListener('click', closeAppearanceModal);

invoke<{ claude_api_key?: string; openai_api_key?: string }>('get_api_keys')
  .then((keys) => {
    const claudeApiKey = keys.claude_api_key || legacyKeys.claudeApiKey;
    const openaiApiKey = keys.openai_api_key || legacyKeys.openaiApiKey;
    storedKeys.claudeApiKey = claudeApiKey;
    storedKeys.openaiApiKey = openaiApiKey;
    if ((!keys.claude_api_key && legacyKeys.claudeApiKey) || (!keys.openai_api_key && legacyKeys.openaiApiKey)) {
      return invoke('save_api_keys', {
        claude_api_key: !keys.claude_api_key ? legacyKeys.claudeApiKey || null : null,
        openai_api_key: !keys.openai_api_key ? legacyKeys.openaiApiKey || null : null
      });
    }
  })
  .then(() => {
    localStorage.removeItem('ichibot.apiKeys');
    sendProviderConfig();
  })
  .catch((error) => {
    addMsg('assistant', 'No se pudieron leer las claves del Llavero de macOS: ' + String(error));
  });

providerSelect.addEventListener('change', () => {
  renderModelOptions();
  sendProviderConfig();
});

modelSelect.addEventListener('change', sendProviderConfig);

function closeApproval() {
  pendingApprovalId = null;
  approvalModal.classList.remove('show');
  approvalModal.setAttribute('aria-hidden', 'true');
  setTimeout(() => approvalModal.classList.add('hidden'), 160);
}

function answerApproval(decision: 'allow' | 'deny' | 'always') {
  if (!pendingApprovalId) return;
  emit('ichibot:approval-response', { id: pendingApprovalId, decision }).catch(() => {});
  closeApproval();
}

approvalDeny.addEventListener('click', () => answerApproval('deny'));
approvalAlways.addEventListener('click', () => answerApproval('always'));
approvalAllow.addEventListener('click', () => answerApproval('allow'));

function autoResize() {
  input.style.height = '34px';
  input.style.height = Math.min(120, input.scrollHeight) + 'px';
}

input.addEventListener('input', autoResize);
autoResize();

function addMsg(role: 'user' | 'assistant', text: string) {
  const w = document.createElement('div');
  w.className = 'msg ' + role;
  const b = document.createElement('div');
  b.className = 'bubble';
  b.textContent = text;
  w.appendChild(b);
  messagesEl.appendChild(w);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return b;
}

function setBusy(busy: boolean) {
  sendBtn.disabled = busy;
  cancelBtn.classList.toggle('hidden', !busy);
  input.disabled = busy;
}

function addRetryAction(bubble: HTMLDivElement) {
  if (!lastUserMessage) return;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'retry-button';
  retry.textContent = 'Reintentar';
  retry.addEventListener('click', () => submitMessage(lastUserMessage || ''));
  bubble.appendChild(document.createElement('br'));
  bubble.appendChild(retry);
}

function submitMessage(value: string) {
  const v = value.trim();
  if (!v) return;
  lastUserMessage = v;
  messages.push({ role: 'user', content: v });
  addMsg('user', v);
  const active = sessions.find((s) => s.id === activeSessionId);
  if (active && !active.title && messages.length === 1) {
    active.title = v.slice(0, 40);
    renderSessions();
  }
  input.value = '';
  autoResize();
  setBusy(true);
  if (!bridgeReady) addMsg('assistant', '⏳ El agente todavía no está listo...');
  emit('ichibot:chat', { type: 'chat', message: v }).catch(() => {
    const bubble = addMsg('assistant', '⚠️ No se pudo enviar el mensaje al agente');
    addRetryAction(bubble);
    setBusy(false);
  });
}

cancelBtn.addEventListener('click', () => {
  emit('ichibot:chat', { type: 'chat:cancel' }).catch(() => {});
});

function renderMessages() {
  messagesEl.replaceChildren();
  for (const m of messages) addMsg(m.role, m.content);
}

function renderSessions() {
  sidebarListEl.replaceChildren();
  for (const s of sessions) {
    const item = document.createElement('div');
    item.className = 'session-item' + (s.id === activeSessionId ? ' active' : '');

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'session-open';

    const title = document.createElement('span');
    title.className = 'session-title';
    title.textContent = s.title || 'Nueva conversación';

    const time = document.createElement('span');
    time.className = 'session-time';
    time.textContent = new Date(s.updatedAt).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    open.append(title, time);
    const id = s.id;
    open.addEventListener('click', () => {
      if (id === activeSessionId) return;
      emit('ichibot:chat', { type: 'session:load', id }).catch(() => {});
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'session-delete';
    remove.textContent = '×';
    remove.title = 'Eliminar conversación';
    remove.setAttribute('aria-label', `Eliminar ${s.title || 'nueva conversación'}`);
    remove.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      emit('ichibot:chat', { type: 'session:delete', id }).catch(() => {});
    });
    item.append(open, remove);
    sidebarListEl.appendChild(item);
  }
}

// Refresca el item del sidebar después de un turno completo: baja messageCount
// al valor real de la conversación, lo manda arriba por updatedAt y reordena.
function refreshSessionItem(id: string) {
  const s = sessions.find((v) => v.id === id);
  if (!s) return;
  s.updatedAt = Date.now();
  if (id === activeSessionId) s.messageCount = messages.length;
  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  renderSessions();
}

// El sidecar lo hostea la ventana overlay: acá solo escuchamos los eventos relayeados
listen<AgentEvent>('ichibot:agent-event', (ev) => {
  const e = ev.payload;
  switch (e.type) {
    case 'state':
      companionStatus.textContent = e.state === 'thinking' ? 'Pensando…' : e.state === 'tool_call' ? 'Usando una herramienta…' : e.state === 'error' ? 'Necesita atención' : 'Mascota conectada';
      break;
    case 'response_chunk':
      if (!e.text) break;
      if (!streamingBubble) streamingBubble = addMsg('assistant', '');
      streamingBubble.textContent += e.text;
      messagesEl.scrollTop = messagesEl.scrollHeight;
      break;
    case 'response_complete': {
      // Si todavía no sabemos cuál es la sesión activa, la adoptamos del turno.
      if (e.sessionId && activeSessionId === null) activeSessionId = e.sessionId;
      const fromActive = !e.sessionId || e.sessionId === activeSessionId;
      const hadStreamingBubble = Boolean(streamingBubble);
      if (streamingBubble) {
        // Si el pane se limpió a mitad de stream, la burbuja quedó desprendida:
        // el texto se escribe ahí y no se filtra en la conversación nueva.
        streamingBubble.textContent = e.text || 'El modelo no devolvió texto. Prueba GPT-4o mini o revisa la clave y los permisos de OpenAI.';
        streamingBubble = null;
      } else if (fromActive && e.text) {
        addMsg('assistant', e.text);
      }
      if (fromActive && !e.text && !hadStreamingBubble) {
        addMsg('assistant', 'El modelo no devolvió texto. Prueba GPT-4o mini o revisa la clave y los permisos de OpenAI.');
      }
      if (fromActive) {
        messages.push({ role: 'assistant', content: e.text });
        if (e.sessionId) refreshSessionItem(e.sessionId);
      }
      lastUserMessage = null;
      setBusy(false);
      input.focus();
      break;
    }
    case 'response_cancelled':
      streamingBubble = null;
      addMsg('assistant', 'Respuesta cancelada.');
      setBusy(false);
      break;
    case 'needs_approval':
      pendingApprovalId = e.payload.id;
      approvalTitle.textContent = e.payload.title;
      approvalDescription.textContent = e.payload.description || 'El agente necesita tu permiso para continuar.';
      approvalModal.classList.remove('hidden');
      approvalModal.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => approvalModal.classList.add('show'));
      invoke('show_chat').catch(() => {});
      break;
    case 'session_list':
      sessions = e.sessions;
      // La lista llega apenas arranca el agente: la primera entrada es la
      // sesión nueva con la que abre el sidecar.
      if (activeSessionId === null && sessions.length > 0) activeSessionId = sessions[0].id;
      renderSessions();
      break;
    case 'session_loaded':
      activeSessionId = e.id;
      messages = e.messages.slice();
      renderMessages();
      renderSessions();
      break;
    case 'session_new':
      activeSessionId = e.id;
      messages = [];
      renderMessages();
      sessions = [
        { id: e.id, title: '', updatedAt: Date.now(), messageCount: 0 },
        ...sessions.filter((s) => s.id !== e.id)
      ];
      renderSessions();
      break;
    case 'session_deleted':
      sessions = sessions.filter((session) => session.id !== e.id);
      sessions = [
        ...sessions.filter((session) => session.id !== e.replacement.id),
        e.replacement
      ].sort((a, b) => b.updatedAt - a.updatedAt);
      if (activeSessionId === e.id) {
        activeSessionId = e.replacement.id;
        messages = [];
        renderMessages();
      }
      renderSessions();
      break;
    case 'error':
      providerEl.textContent = 'Error de API';
      providerEl.classList.add('provider-error');
      if (streamingBubble) {
        streamingBubble.textContent = 'Error: ' + e.message;
        addRetryAction(streamingBubble);
        streamingBubble = null;
      } else {
        const bubble = addMsg('assistant', 'Error: ' + e.message);
        addRetryAction(bubble);
      }
      streamingBubble = null;
      setBusy(false);
      break;
    case 'ready':
      if (!bridgeReady) {
        bridgeReady = true;
        sendProviderConfig();
      }
      providerEl.classList.remove('provider-error');
      break;
    default:
      break;
  }
});

listen<string>('ichibot:appearance', (event) => {
  const labels: Record<string, string> = {
    mochi: 'Mochi',
    face: 'Ichibot face',
    face2: 'Ichibot face 2',
    face3: 'Ichibot face 3',
    face4: 'Ichibot face 4'
  };
  companionStatus.textContent = `${labels[event.payload] || 'Ichibot'} · conectada`;
}).catch(() => {});

// Pide el historial apenas queda registrado el listener (el agente también
// manda la lista cuando queda ready, así que llega igual aunque este emit se pierda)
emit('ichibot:chat', { type: 'session:list' }).catch(() => {});

newSessionBtn.addEventListener('click', () => {
  emit('ichibot:chat', { type: 'session:new' }).catch(() => {});
});

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  submitMessage(input.value);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});
