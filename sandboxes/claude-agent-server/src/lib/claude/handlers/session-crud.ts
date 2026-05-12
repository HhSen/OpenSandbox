import {
  forkSession,
  getSessionInfo,
  getSessionMessages,
  listSessions,
  renameSession,
  tagSession,
} from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import { HttpError } from '../../http/errors.js'
import { runtimeRegistry } from '../adapters/runtime-registry.js'
import type {
  forkSessionBodySchema,
  getMessagesQuerySchema,
  listSessionsQuerySchema,
  patchSessionBodySchema,
} from './schemas.js'

function definedEntries<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  )
}

export async function listStoredSessions(input: z.infer<typeof listSessionsQuerySchema>) {
  return listSessions(definedEntries(input) as Parameters<typeof listSessions>[0])
}

export async function getStoredSession(sessionId: string, dir?: string) {
  const info = await getSessionInfo(
    sessionId,
    definedEntries({ dir }) as Parameters<typeof getSessionInfo>[1],
  )
  if (!info) {
    throw new HttpError(404, `Session ${sessionId} not found`)
  }

  return {
    ...info,
    runtime: runtimeRegistry.get(sessionId),
  }
}

export async function getStoredMessages(sessionId: string, input: z.infer<typeof getMessagesQuerySchema>) {
  return getSessionMessages(sessionId, definedEntries(input) as Parameters<typeof getSessionMessages>[1])
}

export async function updateStoredSession(sessionId: string, input: z.infer<typeof patchSessionBodySchema>) {
  if (input.title !== undefined) {
    await renameSession(
      sessionId,
      input.title,
      definedEntries({ dir: input.dir }) as Parameters<typeof renameSession>[2],
    )
  }

  if (input.tag !== undefined) {
    await tagSession(
      sessionId,
      input.tag,
      definedEntries({ dir: input.dir }) as Parameters<typeof tagSession>[2],
    )
  }

  return getStoredSession(sessionId, input.dir)
}

export async function forkStoredSession(sessionId: string, input: z.infer<typeof forkSessionBodySchema>) {
  const forked = await forkSession(
    sessionId,
    definedEntries({
      dir: input.dir,
      title: input.title,
      upToMessageId: input.upToMessageId,
    }) as Parameters<typeof forkSession>[1],
  )

  return getStoredSession(forked.sessionId, input.dir)
}
