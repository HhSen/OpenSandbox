import type { SDKSessionInfo, SessionMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import { permissionModeSchema, queryOptionsSchema } from '../adapters/sdk-schemas.js'

export type { QueryOptions } from '../adapters/sdk-schemas.js'

export const listSessionsQuerySchema = z.object({
  dir: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  includeWorktrees: z.coerce.boolean().optional(),
})

export const getMessagesQuerySchema = z.object({
  dir: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  includeSystemMessages: z.coerce.boolean().optional(),
})

export const patchSessionBodySchema = z
  .object({
    dir: z.string().optional(),
    title: z.string().trim().min(1).optional(),
    tag: z.string().trim().min(1).nullable().optional(),
  })
  .refine((value) => value.title !== undefined || value.tag !== undefined, {
    message: 'At least one of title or tag must be provided',
  })

export const forkSessionBodySchema = z.object({
  dir: z.string().optional(),
  title: z.string().trim().min(1).optional(),
  upToMessageId: z.string().trim().min(1).optional(),
})

export const patchModelBodySchema = z.object({
  model: z.string().optional(),
})

export const patchPermissionModeBodySchema = z.object({
  permissionMode: permissionModeSchema,
})

const promptBodyBaseSchema = z.object({
  prompt: z.string().min(1),
  stream: z.boolean().optional(),
  includePartialMessages: z.boolean().optional(),
  options: queryOptionsSchema.optional(),
})

export const createSessionBodySchema = promptBodyBaseSchema

export const sendMessageBodySchema = promptBodyBaseSchema.extend({
  forkSession: z.boolean().optional(),
})

export const rewindSessionBodySchema = z.object({
  userMessageId: z.string().min(1),
  dryRun: z.boolean().optional(),
})

export const respondToPermissionBodySchema = z.object({
  decision: z.enum(['allow', 'deny']),
})

export const respondToQuestionBodySchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
})

export function sdkSessionInfoToResponse(info: SDKSessionInfo) {
  return {
    sessionId: info.sessionId,
    summary: info.summary,
    lastModified: info.lastModified,
    fileSize: info.fileSize ?? null,
    customTitle: info.customTitle ?? null,
    firstPrompt: info.firstPrompt ?? null,
    gitBranch: info.gitBranch ?? null,
    cwd: info.cwd ?? null,
    tag: info.tag ?? null,
    createdAt: info.createdAt ?? null,
  }
}

export function sessionMessageToResponse(message: SessionMessage) {
  return {
    type: message.type,
    uuid: message.uuid,
    sessionId: message.session_id,
    message: message.message,
    parentToolUseId: message.parent_tool_use_id,
  }
}
