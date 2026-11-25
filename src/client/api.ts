export function navigate(href: string): void {
  window.history.pushState({}, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo(0, 0)
}

export async function send<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null
  if (!response.ok)
    throw new Error(payload?.error || 'The request failed. Please try again.')
  if (!payload) throw new Error('The server returned an unexpected response.')
  return payload as T
}
