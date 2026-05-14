import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runtimeRegistry } from '../../../src/lib/claude/adapters/runtime-registry.js'
import { streamMessageToSession } from '../../../src/lib/claude/handlers/index.js'
import { HttpError } from '../../../src/lib/http/errors.js'

afterEach(() => {
  vi.restoreAllMocks()
})

function makeHandle() {
  const collected: SDKUserMessage[] = []
  const handle = {
    streamInput: vi.fn().mockImplementation(async (stream: AsyncIterable<SDKUserMessage>) => {
      for await (const msg of stream) {
        collected.push(msg)
      }
    }),
  } as unknown as Query
  return { handle, collected }
}

describe('streamMessageToSession', () => {
  it('throws 409 when no active run exists', async () => {
    vi.spyOn(runtimeRegistry, 'getQuery').mockReturnValue(null)

    await expect(streamMessageToSession('s1', 'hello')).rejects.toSatisfy(
      (err: unknown) => err instanceof HttpError && err.statusCode === 409,
    )
  })

  it('calls streamInput with a string prompt', async () => {
    const { handle, collected } = makeHandle()
    vi.spyOn(runtimeRegistry, 'getQuery').mockReturnValue(handle)

    await streamMessageToSession('s1', 'hello world')

    expect(collected).toHaveLength(1)
    expect(collected[0]).toMatchObject({
      type: 'user',
      message: { role: 'user', content: 'hello world' },
      parent_tool_use_id: null,
    })
  })

  it('calls streamInput with content block prompt', async () => {
    const { handle, collected } = makeHandle()
    vi.spyOn(runtimeRegistry, 'getQuery').mockReturnValue(handle)

    const blocks = [
      { type: 'text' as const, text: 'what is this?' },
      { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: 'abc' } },
    ]

    await streamMessageToSession('s1', blocks)

    expect(collected).toHaveLength(1)
    expect(collected[0]).toMatchObject({
      type: 'user',
      message: { role: 'user', content: blocks },
      parent_tool_use_id: null,
    })
  })

  it('passes priority when provided', async () => {
    const { handle, collected } = makeHandle()
    vi.spyOn(runtimeRegistry, 'getQuery').mockReturnValue(handle)

    await streamMessageToSession('s1', 'redirect please', 'now')

    expect(collected[0]).toMatchObject({ priority: 'now' })
  })

  it.each(['now', 'next', 'later'] as const)('passes priority "%s" correctly', async (priority) => {
    const { handle, collected } = makeHandle()
    vi.spyOn(runtimeRegistry, 'getQuery').mockReturnValue(handle)

    await streamMessageToSession('s1', 'msg', priority)

    expect(collected[0]?.priority).toBe(priority)
  })

  it('omits priority when not provided', async () => {
    const { handle, collected } = makeHandle()
    vi.spyOn(runtimeRegistry, 'getQuery').mockReturnValue(handle)

    await streamMessageToSession('s1', 'msg')

    expect(collected[0]).not.toHaveProperty('priority')
  })

  it('calls streamInput exactly once per invocation', async () => {
    const { handle } = makeHandle()
    vi.spyOn(runtimeRegistry, 'getQuery').mockReturnValue(handle)

    await streamMessageToSession('s1', 'once')

    expect(handle.streamInput).toHaveBeenCalledTimes(1)
  })
})
