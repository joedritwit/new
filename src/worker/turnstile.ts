import type { Env } from './auth'

export type TurnstileVerifier = (
  env: Env,
  token: string,
  remoteIp: string | null,
) => Promise<boolean>

/**
 * Cloudflare Siteverify. Fails closed: a missing secret, a network error, a
 * non-200 response, or a payload without `success: true` all reject the
 * registration. Tests inject their own verifier through `createApp`.
 */
export const verifyTurnstileToken: TurnstileVerifier = async (
  env,
  token,
  remoteIp,
) => {
  const secret = env.TURNSTILE_SECRET_KEY
  if (!secret || !token) return false

  const form = new URLSearchParams({ secret, response: token })
  if (remoteIp) form.set('remoteip', remoteIp)

  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: form },
    )
    if (!response.ok) return false
    const payload = (await response.json()) as { success?: boolean }
    return payload.success === true
  } catch {
    return false
  }
}
