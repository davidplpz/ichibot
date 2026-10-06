export type AgentState =
  | 'idle'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'needs_approval'
  | 'streaming'
  | 'success'
  | 'error'
  | 'connecting'
  | 'disconnected';

export type ToolCallPayload = {
  tool: string;
  args: Record<string, unknown>;
  toolCallId?: string;
};

export type ToolResultPayload = {
  tool: string;
  result?: unknown;
  error?: string;
  toolCallId?: string;
};

export type ApprovalPayload = {
  id: string;
  title: string;
  description: string;
  tool?: string;
  args?: Record<string, unknown>;
  risk?: 'low' | 'medium' | 'high';
  options?: Array<{ label: string; value: 'allow' | 'deny' | 'always' }>;
};

export type SessionMessage = { role: 'user' | 'assistant'; content: string };

export type SessionSummary = {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
};

export type AgentEvent =
  | { type: 'state'; state: AgentState }
  | { type: 'thinking'; text?: string }
  | { type: 'tool_call'; payload: ToolCallPayload }
  | { type: 'tool_result'; payload: ToolResultPayload }
  | { type: 'needs_approval'; payload: ApprovalPayload }
  | { type: 'response_chunk'; text: string }
  | { type: 'response_complete'; text: string; sessionId?: string }
  | { type: 'response_cancelled'; sessionId?: string }
  | { type: 'session_list'; sessions: SessionSummary[] }
  | { type: 'session_loaded'; id: string; messages: SessionMessage[] }
  | { type: 'session_new'; id: string }
  | { type: 'session_deleted'; id: string; replacement: SessionSummary }
  | { type: 'error'; message: string }
  | { type: 'provider_connected'; provider: 'claude' | 'openai' | 'opencode'; method: 'apikey' | 'oauth' | 'opencode' }
  | { type: 'provider_disconnected'; provider: 'claude' | 'openai' | 'opencode' }
  | { type: 'provider_connecting'; provider: 'claude' | 'openai' | 'opencode' }
  | { type: 'ready' };

export type ApprovalResponse = {
  id: string;
  decision: 'allow' | 'deny' | 'always';
};
