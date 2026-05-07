import { apiFetch, loadSettings } from '@/api/client.ts'

const EXECD_PORT = 44772

export interface PtySession {
  session_id: string
}

export async function createPtySession(sandboxId: string, cwd?: string): Promise<PtySession> {
  return apiFetch<PtySession>(`/sandboxes/${sandboxId}/proxy/${EXECD_PORT}/pty`, {
    method: 'POST',
    body: JSON.stringify(cwd ? { cwd } : {}),
  })
}

export async function deletePtySession(sandboxId: string, sessionId: string): Promise<void> {
  return apiFetch<void>(`/sandboxes/${sandboxId}/proxy/${EXECD_PORT}/pty/${sessionId}`, {
    method: 'DELETE',
  })
}

export function buildPtyWebSocketUrl(sandboxId: string, sessionId: string): string {
  const settings = loadSettings()
  const url = new URL(settings.serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = url.pathname.replace(/\/$/, '') + `/sandboxes/${sandboxId}/proxy/${EXECD_PORT}/pty/${sessionId}/ws`
  return url.toString()
}
