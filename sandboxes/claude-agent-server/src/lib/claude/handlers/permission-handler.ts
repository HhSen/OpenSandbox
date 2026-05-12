import { HttpError } from '../../http/errors.js'

// ---------------------------------------------------------------------------
// PermissionRegistry
// ---------------------------------------------------------------------------

type DecisionHandler = (decision: 'allow' | 'deny') => void

class PermissionRegistry {
  private readonly pending = new Map<string, DecisionHandler>()

  register(sessionId: string, handler: DecisionHandler): void {
    this.pending.set(sessionId, handler)
  }

  respond(sessionId: string, decision: 'allow' | 'deny'): boolean {
    const handler = this.pending.get(sessionId)
    if (!handler) return false
    this.pending.delete(sessionId)
    handler(decision)
    return true
  }

  has(sessionId: string): boolean {
    return this.pending.has(sessionId)
  }

  delete(sessionId: string): void {
    this.pending.delete(sessionId)
  }
}

export const permissionRegistry = new PermissionRegistry()

// ---------------------------------------------------------------------------
// QuestionRegistry
// ---------------------------------------------------------------------------

type QuestionItem = Record<string, unknown>
type AnswerHandler = (answers: Record<string, string | string[]>) => void

interface PendingQuestion {
  questions: QuestionItem[]
  handler: AnswerHandler
}

class QuestionRegistry {
  private readonly pending = new Map<string, PendingQuestion>()

  register(sessionId: string, questions: QuestionItem[], handler: AnswerHandler): void {
    this.pending.set(sessionId, { questions, handler })
  }

  respond(sessionId: string, answers: Record<string, string | string[]>): boolean {
    const pending = this.pending.get(sessionId)
    if (!pending) return false
    this.pending.delete(sessionId)
    pending.handler(answers)
    return true
  }

  has(sessionId: string): boolean {
    return this.pending.has(sessionId)
  }

  delete(sessionId: string): void {
    this.pending.delete(sessionId)
  }
}

export const questionRegistry = new QuestionRegistry()

// ---------------------------------------------------------------------------
// Response handlers
// ---------------------------------------------------------------------------

/**
 * Resolves a pending canUseTool permission request for the given session.
 * Returns 404 if no permission request is currently pending.
 */
export async function respondToPermission(
  sessionId: string,
  decision: 'allow' | 'deny',
): Promise<{ ok: true; sessionId: string; decision: 'allow' | 'deny' }> {
  const resolved = permissionRegistry.respond(sessionId, decision)
  if (!resolved) {
    throw new HttpError(404, `No pending permission request for session ${sessionId}`)
  }
  return { ok: true, sessionId, decision }
}

/**
 * Resolves a pending AskUserQuestion request for the given session.
 * Returns 404 if no question is currently pending.
 */
export async function respondToQuestion(
  sessionId: string,
  answers: Record<string, string | string[]>,
): Promise<{ ok: true; sessionId: string }> {
  const resolved = questionRegistry.respond(sessionId, answers)
  if (!resolved) {
    throw new HttpError(404, `No pending question for session ${sessionId}`)
  }
  return { ok: true, sessionId }
}
