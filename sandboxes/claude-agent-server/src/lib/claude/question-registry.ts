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
