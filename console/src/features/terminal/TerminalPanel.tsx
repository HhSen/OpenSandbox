import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { Sandbox } from '@/api/types.ts'
import { buildPtyWebSocketUrl, createPtySession } from '@/api/terminal.ts'

interface Props {
  sandbox: Sandbox
  onClose: () => void
}

// Binary frame type bytes (matches execd/pkg/web/model/pty_ws.go)
const BIN_STDIN = 0x00
const BIN_STDOUT = 0x01
const BIN_REPLAY = 0x03

type Status = 'connecting' | 'connected' | 'disconnected' | 'error'

interface ServerFrame {
  type: string
  exit_code?: number
  error?: string
  code?: string
}

// Persists across StrictMode double-invocations so both effects share one in-flight request.
// Keyed by sandboxId so switching to a different sandbox always creates a fresh session.
type SessionInit = { sandboxId: string; promise: Promise<string> }

export function TerminalPanel({ sandbox, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const sessionInitRef = useRef<SessionInit | null>(null)
  const [status, setStatus] = useState<Status>('connecting')
  const [statusMsg, setStatusMsg] = useState('')

  useEffect(() => {
    let destroyed = false

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: '#0a0a0a',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#d7ba7d',
        blue: '#569cd6',
        magenta: '#c678dd',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#d7ba7d',
        brightBlue: '#569cd6',
        brightMagenta: '#c678dd',
        brightCyan: '#4ec9b0',
        brightWhite: '#ffffff',
      },
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    if (containerRef.current) {
      terminal.open(containerRef.current)
      fitAddon.fit()
    }

    // Send stdin input to WebSocket
    terminal.onData((data) => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        const bytes = new TextEncoder().encode(data)
        const frame = new Uint8Array(1 + bytes.length)
        frame[0] = BIN_STDIN
        frame.set(bytes, 1)
        ws.send(frame)
      }
    })

    // Forward terminal resize events
    terminal.onResize(({ cols, rows }) => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })

    async function connect() {
      try {
        // Share the in-flight request across StrictMode double-invocation.
        // Both effects await the same Promise, so only one HTTP POST is made.
        if (!sessionInitRef.current || sessionInitRef.current.sandboxId !== sandbox.id) {
          sessionInitRef.current = {
            sandboxId: sandbox.id,
            promise: createPtySession(sandbox.id).then((s) => s.session_id),
          }
        }
        const sessionId = await sessionInitRef.current.promise
        if (destroyed) return

        const wsUrl = buildPtyWebSocketUrl(sandbox.id, sessionId)
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws
        ws.binaryType = 'arraybuffer'

        ws.onopen = () => {
          if (destroyed) { ws.close(); return }
          // Send initial terminal size so bash starts with the correct dimensions
          const { cols, rows } = terminal
          ws.send(JSON.stringify({ type: 'resize', cols, rows }))
        }

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            const buf = new Uint8Array(event.data)
            if (buf[0] === BIN_STDOUT) {
              terminal.write(buf.slice(1))
            } else if (buf[0] === BIN_REPLAY) {
              // Skip 8-byte big-endian offset header
              terminal.write(buf.slice(9))
            }
          } else {
            try {
              const frame = JSON.parse(event.data as string) as ServerFrame
              if (frame.type === 'connected') {
                setStatus('connected')
              } else if (frame.type === 'exit') {
                const code = frame.exit_code ?? '?'
                setStatus('disconnected')
                setStatusMsg(`Exited (${code})`)
                terminal.write(`\r\n\x1b[2m[Process exited with code ${code}]\x1b[0m\r\n`)
              } else if (frame.type === 'error') {
                setStatus('error')
                setStatusMsg(frame.error ?? frame.code ?? 'Unknown error')
              }
            } catch {
              // ignore malformed JSON frames
              if (import.meta.env.DEV) console.warn('[TerminalPanel] unexpected server frame', event.data)
            }
          }
        }

        ws.onclose = () => {
          if (!destroyed) {
            setStatus((prev) => (prev === 'connected' ? 'disconnected' : prev))
          }
        }

        ws.onerror = () => {
          if (!destroyed) {
            setStatus('error')
            setStatusMsg('Connection failed')
          }
        }
      } catch (err) {
        sessionInitRef.current = null  // allow retry on next open
        if (!destroyed) {
          setStatus('error')
          setStatusMsg(err instanceof Error ? err.message : 'Failed to start terminal')
        }
      }
    }

    void connect()

    // Resize terminal when container changes size
    const observer = new ResizeObserver(() => {
      fitAddon.fit()
    })
    if (containerRef.current) observer.observe(containerRef.current)

    return () => {
      destroyed = true
      observer.disconnect()
      wsRef.current?.close()
      wsRef.current = null
      terminal.dispose()
      // sessionInitRef is intentionally preserved across StrictMode remounts so the
      // second invocation reconnects to the same PTY session rather than creating a new
      // one. PTY sessions end when the WebSocket closes (bash exits) and are GC'd when
      // the sandbox is destroyed — no explicit DELETE is needed here.
    }
  }, [sandbox.id])

  function sendSignal(signal: string) {
    wsRef.current?.send(JSON.stringify({ type: 'signal', signal }))
  }

  const dotClass =
    status === 'connected'
      ? 'bg-green-500'
      : status === 'connecting'
        ? 'bg-yellow-500 animate-pulse'
        : 'bg-red-500'

  const statusLabel =
    statusMsg ||
    (status === 'connecting'
      ? 'Connecting…'
      : status === 'connected'
        ? sandbox.id
        : status === 'disconnected'
          ? 'Disconnected'
          : 'Error')

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-4xl bg-neutral-950 border-l border-neutral-800 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">Terminal</div>
              <div className="text-xs text-neutral-500 font-mono truncate">{statusLabel}</div>
            </div>
            {status === 'connected' && (
              <button
                onClick={() => sendSignal('SIGINT')}
                title="Send Ctrl+C (SIGINT)"
                className="text-xs text-neutral-400 hover:text-white px-2 py-0.5 rounded hover:bg-neutral-800 font-mono"
              >
                Ctrl+C
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800"
            >
              ✕
            </button>
          </div>
        </div>

        {/* xterm.js container */}
        <div
          ref={containerRef}
          className="flex-1 p-2 overflow-hidden"
          style={{ minHeight: 0 }}
        />
      </div>
    </div>
  )
}
