import {
  getSessionInfo,
  type PermissionMode,
  type RewindFilesResult,
  type SDKControlGetContextUsageResponse,
} from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import { HttpError } from '../../http/errors.js'
import { runtimeRegistry } from '../adapters/runtime-registry.js'
import type { rewindSessionBodySchema } from './schemas.js'

/**
 * Returns the Query handle for a session, throwing 404/409 as appropriate.
 * - 404: session is completely unknown to the SDK store
 * - 409: session exists but has no active run, or the active run is stopping
 *
 * Rejects sessions in the `stopping` state so that destructive operations
 * (e.g. rewindFiles) cannot race against SDK teardown and leave the working
 * tree in an inconsistent state.
 */
async function requireActiveQuery(sessionId: string) {
  const run = runtimeRegistry.get(sessionId)

  if (run) {
    if (run.status === 'stopping') {
      throw new HttpError(409, `Session ${sessionId} is stopping; wait for it to finish before issuing new operations`)
    }
    return run.query
  }

  // Distinguish unknown session (404) from idle session (409)
  const info = await getSessionInfo(sessionId).catch(() => null)
  if (!info) {
    throw new HttpError(404, `Session ${sessionId} not found`)
  }
  throw new HttpError(409, `Session ${sessionId} has no active run. Start a prompt first.`)
}

/**
 * Roll back file changes to the state at a prior user message turn.
 * Requires that the session was started with options.enableFileCheckpointing=true.
 */
export async function rewindSessionFiles(
  sessionId: string,
  input: z.infer<typeof rewindSessionBodySchema>,
): Promise<RewindFilesResult> {
  const q = await requireActiveQuery(sessionId)
  const dryRun = input.dryRun
  return q.rewindFiles(input.userMessageId, ...(dryRun !== undefined ? [{ dryRun }] : []))
}

/**
 * Returns the slash commands supported by the active Claude Code session.
 */
export async function getSessionCommands(sessionId: string) {
  const q = await requireActiveQuery(sessionId)
  const commands = await q.supportedCommands()
  return { commands }
}

/**
 * Returns the models available in the active session.
 */
export async function getSessionModels(sessionId: string) {
  const q = await requireActiveQuery(sessionId)
  const models = await q.supportedModels()
  return { models }
}

/**
 * Returns the agents available in the active session.
 */
export async function getSessionAgents(sessionId: string) {
  const q = await requireActiveQuery(sessionId)
  const agents = await q.supportedAgents()
  return { agents }
}

/**
 * Returns the context (token) usage breakdown for the active session.
 */
export async function getSessionContext(sessionId: string): Promise<SDKControlGetContextUsageResponse> {
  const q = await requireActiveQuery(sessionId)
  return q.getContextUsage()
}

/**
 * Hot-swaps the model on the active session.
 * Only available when the session was started with a streaming input prompt (AsyncIterable).
 * SDK will throw if called on a non-streaming query; this surfaces as a 502.
 */
export async function setSessionModel(sessionId: string, model?: string) {
  const q = await requireActiveQuery(sessionId)
  await q.setModel(model)
  return { ok: true, sessionId, model }
}

/**
 * Changes the permission mode on the active session.
 * bypassPermissions is rejected with 400 (consistent with execute()).
 * Only available when the session was started with a streaming input prompt (AsyncIterable).
 */
export async function setSessionPermissionMode(sessionId: string, mode: PermissionMode) {
  if (mode === 'bypassPermissions') {
    throw new HttpError(400, 'permissionMode=bypassPermissions is not enabled in this server')
  }
  const q = await requireActiveQuery(sessionId)
  await q.setPermissionMode(mode)
  return { ok: true, sessionId, permissionMode: mode }
}
