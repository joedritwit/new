import { createFreebuffAuth } from '@freebuff/auth'
import type { FreebuffAuth, FreebuffUser } from '@freebuff/auth'

export type Env = {
  ASSETS: Fetcher
  DB?: D1Database
  FILES?: R2Bucket
  REALTIME?: DurableObjectNamespace
  FREEBUFF_CLIENT_ID?: string
  FREEBUFF_ISSUER?: string
  APP_ORIGIN?: string
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/** The preview proxy forwards to the VM's private address, not the public host. */
function isLocalHost(hostname: string): boolean {
  if (LOOPBACK.has(hostname) || hostname.endsWith('.local')) return true
  if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return true
  return /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)
}

/**
 * Local dev and the cloud preview have no hosted auth env. Sites injects
 * APP_ORIGIN and FREEBUFF_CLIENT_ID on every deployment, so a deployed site
 * never takes this branch.
 */
export function isLocalPreview(request: Request, env: Env): boolean {
  if (env.FREEBUFF_CLIENT_ID || env.APP_ORIGIN) return false
  return isLocalHost(new URL(request.url).hostname)
}

let cached: { key: string; auth: FreebuffAuth } | undefined

export function getAuth(env: Env): FreebuffAuth | null {
  if (!env.FREEBUFF_CLIENT_ID || !env.APP_ORIGIN) return null
  // The canonical origin comes from Sites, never from a request Host header.
  const origin = new URL(env.APP_ORIGIN)
  const key = JSON.stringify([
    env.FREEBUFF_CLIENT_ID,
    env.FREEBUFF_ISSUER,
    env.APP_ORIGIN,
  ])
  if (cached?.key !== key) {
    cached = {
      key,
      auth: createFreebuffAuth({
        clientId: env.FREEBUFF_CLIENT_ID,
        issuer: env.FREEBUFF_ISSUER || undefined,
        baseUrl: env.APP_ORIGIN,
        allowInsecureLocalhost:
          origin.protocol === 'http:' && LOOPBACK.has(origin.hostname),
      }),
    }
  }
  return cached.auth
}

export async function currentUser(
  request: Request,
  env: Env,
): Promise<FreebuffUser | null> {
  const auth = getAuth(env)
  if (auth) return auth.getUser(request)
  // A single preview identity keeps first run usable without provisioning.
  // This fallback never applies on a hosted origin or to incomplete auth config.
  return isLocalPreview(request, env)
    ? { sub: 'local-preview', name: 'Local preview' }
    : null
}

export function appOrigin(request: Request, env: Env): string | null {
  return (
    env.APP_ORIGIN ||
    (isLocalPreview(request, env) ? new URL(request.url).origin : null)
  )
}
