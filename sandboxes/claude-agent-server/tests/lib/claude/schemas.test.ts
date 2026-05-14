import { describe, expect, it } from 'vitest'

import {
  imageBlockParamSchema,
  promptContentSchema,
} from '../../../src/lib/claude/adapters/schemas.js'
import { createSessionBodySchema, sendMessageBodySchema } from '../../../src/lib/claude/handlers/schemas.js'

describe('promptContentSchema', () => {
  it('accepts a plain string', () => {
    expect(promptContentSchema.parse('hello')).toBe('hello')
  })

  it('rejects an empty string', () => {
    expect(() => promptContentSchema.parse('')).toThrow()
  })

  it('accepts a text block array', () => {
    const blocks = [{ type: 'text', text: 'hello world' }]
    expect(promptContentSchema.parse(blocks)).toEqual(blocks)
  })

  it('accepts a base64 image block', () => {
    const blocks = [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } }]
    expect(promptContentSchema.parse(blocks)).toEqual(blocks)
  })

  it('accepts a URL image block', () => {
    const blocks = [{ type: 'image', source: { type: 'url', url: 'https://example.com/img.png' } }]
    expect(promptContentSchema.parse(blocks)).toEqual(blocks)
  })

  it('accepts mixed text and image blocks', () => {
    const blocks = [
      { type: 'text', text: 'describe this' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'xyz' } },
    ]
    expect(promptContentSchema.parse(blocks)).toEqual(blocks)
  })

  it('rejects an empty array', () => {
    expect(() => promptContentSchema.parse([])).toThrow()
  })

  it('rejects an unknown block type', () => {
    expect(() => promptContentSchema.parse([{ type: 'video', url: 'https://example.com' }])).toThrow()
  })
})

describe('imageBlockParamSchema', () => {
  it.each(['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const)(
    'accepts media_type %s',
    (media_type) => {
      expect(() =>
        imageBlockParamSchema.parse({ type: 'image', source: { type: 'base64', media_type, data: 'abc' } }),
      ).not.toThrow()
    },
  )

  it('rejects an unsupported media type', () => {
    expect(() =>
      imageBlockParamSchema.parse({ type: 'image', source: { type: 'base64', media_type: 'image/bmp', data: 'abc' } }),
    ).toThrow()
  })

  it('rejects a URL source with an invalid URL', () => {
    expect(() =>
      imageBlockParamSchema.parse({ type: 'image', source: { type: 'url', url: 'not-a-url' } }),
    ).toThrow()
  })

  it('rejects empty base64 data', () => {
    expect(() =>
      imageBlockParamSchema.parse({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: '' } }),
    ).toThrow()
  })
})

describe('sendMessageBodySchema', () => {
  it.each(['now', 'next', 'later'] as const)('accepts priority "%s"', (priority) => {
    expect(sendMessageBodySchema.parse({ prompt: 'hi', priority })).toMatchObject({ priority })
  })

  it('rejects an invalid priority value', () => {
    expect(() => sendMessageBodySchema.parse({ prompt: 'hi', priority: 'urgent' })).toThrow()
  })

  it('allows priority to be omitted', () => {
    const result = sendMessageBodySchema.parse({ prompt: 'hi' })
    expect(result.priority).toBeUndefined()
  })

  it('accepts a content block array as prompt', () => {
    const result = sendMessageBodySchema.parse({ prompt: [{ type: 'text', text: 'hello' }] })
    expect(result.prompt).toEqual([{ type: 'text', text: 'hello' }])
  })

  it('accepts forkSession alongside content blocks', () => {
    const result = sendMessageBodySchema.parse({
      prompt: [{ type: 'text', text: 'hi' }],
      forkSession: true,
    })
    expect(result.forkSession).toBe(true)
  })
})

describe('createSessionBodySchema', () => {
  it('accepts a plain string prompt', () => {
    const result = createSessionBodySchema.parse({ prompt: 'start here' })
    expect(result.prompt).toBe('start here')
  })

  it('accepts a content block array with an image', () => {
    const blocks = [
      { type: 'text', text: 'look at this' },
      { type: 'image', source: { type: 'url', url: 'https://example.com/a.png' } },
    ]
    const result = createSessionBodySchema.parse({ prompt: blocks })
    expect(result.prompt).toEqual(blocks)
  })

  it('rejects a missing prompt', () => {
    expect(() => createSessionBodySchema.parse({})).toThrow()
  })
})
