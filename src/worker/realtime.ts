import type { Env } from './auth'

/**
 * Thin wrapper around the Sites-managed realtime room hub. The application
 * owns authorization: the browser only ever asks for its own user room, and
 * the server derives the room from the authenticated subject.
 */

type Ticket = {
  websocketUrl: string
  expiresAt?: number
  expiresInMs?: number
}

function hub(env: Env): DurableObjectStub | null {
  if (!env.REALTIME) return null
  return env.REALTIME.get(env.REALTIME.idFromName('hub'))
}

async function call(
  env: Env,
  path: string,
  body: unknown,
): Promise<Response | null> {
  const stub = hub(env)
  if (!stub) return null
  return stub.fetch(
    new Request(`https://realtime${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export function notificationRoom(userId: string): string {
  return `user:${userId}`
}

export async function createNotificationTicket(
  env: Env,
  input: { room: string; userId: string; origin: string },
): Promise<Ticket | null> {
  const response = await call(env, '/ticket', {
    ...input,
    publish: false,
    presence: false,
  })
  if (!response?.ok) return null
  return (await response.json()) as Ticket
}

export async function publishNotification(
  env: Env | undefined,
  userId: string,
  notificationId: string,
): Promise<void> {
  if (!env?.REALTIME) return
  try {
    await call(env, '/publish', {
      room: notificationRoom(userId),
      event: 'notification',
      data: { id: notificationId },
    })
  } catch {
    // Realtime is an optimization; D1 remains the source of truth.
  }
}
