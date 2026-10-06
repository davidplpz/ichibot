import type { AgentEvent, ApprovalResponse } from '@ichibot/shared';

export function emit(event: AgentEvent) {
  const line = JSON.stringify(event) + '\n';
  process.stdout.write(line);
}

const pendingApprovals = new Map<string, (res: ApprovalResponse) => void>();

export function requestApproval(
  payload: Extract<AgentEvent, { type: 'needs_approval' }>['payload']
): Promise<ApprovalResponse> {
  return new Promise((resolve) => {
    pendingApprovals.set(payload.id, resolve);
    emit({ type: 'needs_approval', payload });
  });
}

export function resolveApproval(response: ApprovalResponse) {
  const resolver = pendingApprovals.get(response.id);
  if (resolver) {
    pendingApprovals.delete(response.id);
    resolver(response);
  }
}
