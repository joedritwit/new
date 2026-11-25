/**
 * Minimal browser client for the Sites-managed notification room. It asks the
 * application for a ticket, connects, and renews shortly before the ticket
 * expires. Any failure falls back to the component's visibility-aware poll.
 */

type Message = {
  type: string
  event?: string
  data?: unknown
  expiresInMs?: number
}

export type RealtimeConnection = { close: () => void }

export function connectRealtime({
  room,
  onMessage,
  onStatus,
}: {
  room: string
  onMessage: (message: Message) => void
  onStatus?: (status: string) => void
}): RealtimeConnection {
  let socket: WebSocket | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let renewal: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let retry = 0
  let pending: AbortController | undefined

  const schedule = () => {
    if (stopped) return
    const delay = Math.min(30_000, 500 * 2 ** Math.min(retry++, 6))
    timer = setTimeout(() => void open(), delay)
  }

  const retire = (connection: WebSocket | undefined) => {
    clearTimeout(renewal)
    renewal = undefined
    if (!connection) return
    connection.onmessage = connection.onclose = connection.onerror = null
    if (socket === connection) socket = undefined
    try {
      connection.close(1000, 'Authorization renewal')
    } catch {
      // already closed
    }
  }

  async function open() {
    if (stopped || pending) return
    onStatus?.('connecting')
    const controller = new AbortController()
    pending = controller
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch('/api/realtime/ticket', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room }),
        signal: controller.signal,
      })
      if (stopped) return
      if (response.status === 401 || response.status === 403) {
        stopped = true
        onStatus?.('unauthorized')
        return
      }
      if (!response.ok) throw new Error('Ticket request failed.')
      const ticket = (await response.json()) as {
        enabled?: boolean
        websocketUrl?: string
      }
      if (!ticket.enabled || !ticket.websocketUrl) {
        onStatus?.('unavailable')
        return
      }
      const connection = new WebSocket(ticket.websocketUrl)
      socket = connection
      connection.onmessage = ({ data }) => {
        if (stopped || socket !== connection) return
        let message: Message
        try {
          message = JSON.parse(data) as Message
        } catch {
          return
        }
        if (message.type === 'ready') {
          retry = 0
          clearTimeout(renewal)
          const expires = Math.min(
            300_000,
            Math.max(
              1_000,
              Number.isFinite(message.expiresInMs)
                ? (message.expiresInMs as number)
                : 300_000,
            ),
          )
          renewal = setTimeout(
            () => {
              if (stopped || socket !== connection) return
              retire(connection)
              void open()
            },
            Math.max(500, expires - 1_000),
          )
          onStatus?.('connected')
        }
        onMessage(message)
      }
      connection.onclose = () => {
        if (stopped || socket !== connection) return
        retire(connection)
        onStatus?.('disconnected')
        schedule()
      }
      connection.onerror = () => {
        if (stopped || socket !== connection) return
        retire(connection)
        onStatus?.('disconnected')
        schedule()
      }
    } catch {
      if (!stopped) {
        onStatus?.('disconnected')
        schedule()
      }
    } finally {
      clearTimeout(timeout)
      if (pending === controller) pending = undefined
    }
  }

  void open()

  return {
    close() {
      stopped = true
      clearTimeout(timer)
      clearTimeout(renewal)
      pending?.abort()
      retire(socket)
      onStatus?.('closed')
    },
  }
}
