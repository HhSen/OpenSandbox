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
