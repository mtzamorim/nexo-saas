let csrf = '';
export function setCsrf(value: string) { csrf = value; }
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method || 'GET'; const unsafe = !['GET', 'HEAD'].includes(method);
  const response = await fetch(`/api${path}`, {
    method, credentials: 'same-origin', signal: options.signal,
    headers: { ...(unsafe ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {}) },
    body: unsafe ? JSON.stringify(options.body ?? {}) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const issue = data?.issues?.[0];
    throw new ApiError(issue ? `${issue.field}: ${issue.message}` : data?.message || 'Não foi possível acessar o servidor.', response.status, data?.code);
  }
  return data as T;
}
