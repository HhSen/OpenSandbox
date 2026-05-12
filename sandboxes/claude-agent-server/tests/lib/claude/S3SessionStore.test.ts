import { describe, expect, test } from 'vitest'
import type { S3Client } from '@aws-sdk/client-s3'
import { S3SessionStore } from '../../../src/lib/claude/S3SessionStore.js'

// ---------------------------------------------------------------------------
// Minimal in-process S3Client mock backed by a Map<Key, Body>.
// Honors Prefix and Delimiter:'/' for ListObjectsV2.
// ---------------------------------------------------------------------------
function makeMockClient() {
  const objects = new Map<string, string>()
  const calls: Array<{ name: string; input: Record<string, unknown> }> = []

  const client = {
    async send(cmd: {
      constructor: { name: string }
      input: Record<string, unknown>
    }) {
      const name = cmd.constructor.name
      const input = cmd.input
      calls.push({ name, input })
      switch (name) {
        case 'PutObjectCommand': {
          objects.set(input['Key'] as string, input['Body'] as string)
          return {}
        }
        case 'GetObjectCommand': {
          const body = objects.get(input['Key'] as string)
          return { Body: { transformToString: async () => body } }
        }
        case 'ListObjectsV2Command': {
          const prefix = (input['Prefix'] as string) ?? ''
          const delimiter = input['Delimiter'] as string | undefined
          const matched = [...objects.keys()].filter(k => k.startsWith(prefix))
          const contents = matched
            .filter(
              k => !delimiter || !k.slice(prefix.length).includes(delimiter),
            )
            .map(Key => ({ Key }))
          return { Contents: contents }
        }
        case 'DeleteObjectsCommand': {
          for (const o of (input['Delete'] as { Objects: Array<{ Key: string }> })
            .Objects) {
            objects.delete(o.Key)
          }
          return {}
        }
        default:
          throw new Error(`unhandled ${name}`)
      }
    },
  } as unknown as S3Client
  return { client, objects, calls }
}

// ---------------------------------------------------------------------------
// Conformance suite (13 checks) — vitest port of shared/conformance.ts
// ---------------------------------------------------------------------------
type SessionKey = { projectKey: string; sessionId: string; subpath?: string }
type SessionStoreEntry = { type: string; [k: string]: unknown }

const KEY: SessionKey = { projectKey: 'proj', sessionId: 'sess' }
const E = (type: string, extra: Record<string, unknown> = {}) =>
  ({ type, ...extra }) as SessionStoreEntry

function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : val,
  )
}

function expectEntries(actual: unknown, expected: SessionStoreEntry[]) {
  expect(canon(actual)).toBe(canon(expected))
}

describe('S3SessionStore (mock conformance)', () => {
  let n = 0
  const makeStore = () => {
    const { client } = makeMockClient()
    return new S3SessionStore({ bucket: 'b', prefix: `t${n++}`, client })
  }

  test('append then load returns same entries in same order', async () => {
    const store = makeStore()
    const entries = [E('a', { n: 1, nested: { x: [1, 2] } }), E('b', { n: 2 })]
    await store.append(KEY, entries)
    expectEntries(await store.load(KEY), entries)
  })

  test('load unknown key returns null', async () => {
    const store = makeStore()
    expect(await store.load(KEY)).toBeNull()
    expect(await store.load({ ...KEY, subpath: 'subagents/a' })).toBeNull()
  })

  test('multiple append calls preserve call order', async () => {
    const store = makeStore()
    await store.append(KEY, [E('a')])
    await store.append(KEY, [E('b'), E('c')])
    await store.append(KEY, [E('d')])
    expectEntries(await store.load(KEY), [E('a'), E('b'), E('c'), E('d')])
  })

  test('append([]) is a no-op', async () => {
    const store = makeStore()
    await store.append(KEY, [])
    expect(await store.load(KEY)).toBeNull()
    await store.append(KEY, [E('a')])
    await store.append(KEY, [])
    expectEntries(await store.load(KEY), [E('a')])
  })

  test('subpath keys are stored independently of main', async () => {
    const store = makeStore()
    await store.append(KEY, [E('main')])
    await store.append({ ...KEY, subpath: 'subagents/x' }, [E('sub')])
    expectEntries(await store.load(KEY), [E('main')])
    expectEntries(await store.load({ ...KEY, subpath: 'subagents/x' }), [E('sub')])
  })

  test('projectKey isolation', async () => {
    const store = makeStore()
    const A = { projectKey: 'A', sessionId: 's' }
    const B = { projectKey: 'B', sessionId: 's' }
    await store.append(A, [E('a')])
    await store.append(B, [E('b')])
    expectEntries(await store.load(A), [E('a')])
    expectEntries(await store.load(B), [E('b')])
  })

  test('listSessions returns sessionIds for project', async () => {
    const store = makeStore()
    await store.append({ projectKey: 'P', sessionId: 's1' }, [E('a')])
    await store.append({ projectKey: 'P', sessionId: 's2' }, [E('b')])
    await store.append({ projectKey: 'Q', sessionId: 's3' }, [E('c')])
    const ids = (await store.listSessions('P')).map(s => s.sessionId).sort()
    expect(ids).toEqual(['s1', 's2'])
    const r = await store.listSessions('P')
    expect(r.every(s => s.mtime > 1e12)).toBe(true)
    expect(await store.listSessions('never-seen')).toEqual([])
  })

  test('listSessions excludes subagent subpaths', async () => {
    const store = makeStore()
    await store.append(
      { projectKey: 'P', sessionId: 's1', subpath: 'subagents/x' },
      [E('sub')],
    )
    const ids = (await store.listSessions('P')).map(s => s.sessionId)
    expect(ids).not.toContain('s1')
  })

  test('delete main then load returns null', async () => {
    const store = makeStore()
    await store.append(KEY, [E('a')])
    await store.delete(KEY)
    expect(await store.load(KEY)).toBeNull()
    await store.delete({ projectKey: 'x', sessionId: 'never' })
  })

  test('delete main cascades to subkeys', async () => {
    const store = makeStore()
    await store.append(KEY, [E('main')])
    await store.append({ ...KEY, subpath: 'subagents/a' }, [E('sa')])
    await store.append({ ...KEY, subpath: 'subagents/b' }, [E('sb')])
    await store.append({ projectKey: 'proj', sessionId: 'other' }, [E('o')])
    await store.append({ projectKey: 'proj2', sessionId: 'sess' }, [E('p2')])
    await store.delete(KEY)
    expect(await store.load(KEY)).toBeNull()
    expect(await store.load({ ...KEY, subpath: 'subagents/a' })).toBeNull()
    expect(await store.load({ ...KEY, subpath: 'subagents/b' })).toBeNull()
    expectEntries(await store.load({ projectKey: 'proj', sessionId: 'other' }), [E('o')])
    expectEntries(await store.load({ projectKey: 'proj2', sessionId: 'sess' }), [E('p2')])
    expect(await store.listSubkeys(KEY)).toEqual([])
  })

  test('delete with subpath removes only that subkey', async () => {
    const store = makeStore()
    await store.append(KEY, [E('main')])
    await store.append({ ...KEY, subpath: 'subagents/a' }, [E('sa')])
    await store.append({ ...KEY, subpath: 'subagents/b' }, [E('sb')])
    await store.delete({ ...KEY, subpath: 'subagents/a' })
    expectEntries(await store.load(KEY), [E('main')])
    expect(await store.load({ ...KEY, subpath: 'subagents/a' })).toBeNull()
    expectEntries(await store.load({ ...KEY, subpath: 'subagents/b' }), [E('sb')])
  })

  test('listSubkeys returns subpaths for the session', async () => {
    const store = makeStore()
    await store.append({ ...KEY, subpath: 'subagents/a' }, [E('sa')])
    await store.append({ ...KEY, subpath: 'subagents/b' }, [E('sb')])
    await store.append({ projectKey: 'proj', sessionId: 'other', subpath: 'subagents/c' }, [E('sc')])
    const subs = (await store.listSubkeys(KEY)).sort()
    expect(subs).toEqual(['subagents/a', 'subagents/b'])
  })

  test('listSubkeys excludes main transcript', async () => {
    const store = makeStore()
    await store.append(KEY, [E('main')])
    expect(await store.listSubkeys(KEY)).toEqual([])
    expect(await store.listSubkeys({ projectKey: 'x', sessionId: 'never' })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Adapter-specific tests
// ---------------------------------------------------------------------------
describe('S3SessionStore (adapter-specific)', () => {
  // Use short names matching the pre-seeded object keys below.
  const AKEY = { projectKey: 'p', sessionId: 's' }

  test('append writes part-{epochMs13}-{rand6}.jsonl under prefix', async () => {
    const { client, objects } = makeMockClient()
    const store = new S3SessionStore({ bucket: 'b', prefix: 't', client })
    await store.append(AKEY, [{ type: 'a' }])
    const [k] = [...objects.keys()]
    expect(k).toMatch(/^t\/p\/s\/part-\d{13}-[0-9a-f]{6}\.jsonl$/)
  })

  test('same-ms appends are lexically ordered (monotonic counter)', async () => {
    const { client, objects } = makeMockClient()
    const store = new S3SessionStore({ bucket: 'b', client })
    const original = Date.now
    Date.now = () => 1700000000000
    try {
      await store.append(AKEY, [{ type: 'a' }])
      await store.append(AKEY, [{ type: 'b' }])
      await store.append(AKEY, [{ type: 'c' }])
    } finally {
      Date.now = original
    }
    const ks = [...objects.keys()].sort()
    expect(ks).toEqual([...objects.keys()])
    const loaded = await store.load(AKEY)
    expect(loaded?.map(e => e['type'])).toEqual(['a', 'b', 'c'])
  })

  test('append([]) issues no PutObject', async () => {
    const { client, calls } = makeMockClient()
    const store = new S3SessionStore({ bucket: 'b', client })
    await store.append(AKEY, [])
    expect(calls.filter(c => c.name === 'PutObjectCommand')).toHaveLength(0)
  })

  test('load skips malformed JSON lines', async () => {
    const { client, objects } = makeMockClient()
    objects.set('p/s/part-0000000000001-000000.jsonl', '{"type":"a"}\n{bad\n')
    const store = new S3SessionStore({ bucket: 'b', client })
    expect(await store.load(AKEY)).toEqual([{ type: 'a' }])
  })

  test('listSubkeys filters traversal segments', async () => {
    const { client, objects } = makeMockClient()
    objects.set('p/s/subagents/a/part-0000000000001-000000.jsonl', '{}')
    objects.set('p/s/../evil/part-0000000000001-000000.jsonl', '{}')
    const store = new S3SessionStore({ bucket: 'b', client })
    expect(await store.listSubkeys(AKEY)).toEqual(['subagents/a'])
  })

  test.each(['', 'p', 'p/', 'p///'])(
    'prefix %j normalizes without // artifacts',
    async raw => {
      const { client, objects } = makeMockClient()
      const store = new S3SessionStore({ bucket: 'b', prefix: raw, client })
      await store.append(AKEY, [{ type: 'a' }])
      const [k] = [...objects.keys()]
      expect(k.includes('//')).toBe(false)
      expect(k.startsWith('/')).toBe(false)
    },
  )
})
