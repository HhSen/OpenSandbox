import { useCallback, useRef } from 'react'
import { renewSandbox } from '@/api/sandboxes.ts'
import type { Sandbox } from '@/api/types.ts'

const EXTENSION_MS = 60 * 60 * 1000  // extend by 1 hour from now
const RATE_LIMIT_MS = 60 * 1000      // at most one API call per sandbox per minute

/**
 * Returns a `tryRenew(sandbox)` callback that silently extends a sandbox's
 * expiration by 1 hour whenever the user interacts with it.
 *
 * - No-ops if the sandbox has no `expiresAt` (created without a timeout).
 * - No-ops if the new expiry would not be later than the current one.
 * - Rate-limited to one call per sandbox per minute to prevent server spam.
 * - Failures are silently swallowed so they never disrupt the calling flow.
 */
export function useAutoRenew() {
  const lastRef = useRef<Record<string, number>>({})

  return useCallback((sandbox: Sandbox) => {
    if (!sandbox.expiresAt) return

    const now = Date.now()
    if (now - (lastRef.current[sandbox.id] ?? 0) < RATE_LIMIT_MS) return

    const newExpiresAt = new Date(now + EXTENSION_MS)
    if (newExpiresAt <= new Date(sandbox.expiresAt)) return

    lastRef.current[sandbox.id] = now
    renewSandbox(sandbox.id, { expiresAt: newExpiresAt.toISOString() }).catch(() => {})
  }, [])
}
