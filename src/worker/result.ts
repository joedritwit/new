export type Failure = {
  ok: false
  status: 400 | 403 | 404 | 409 | 429
  error: string
}
export type Success<T> = { ok: true; value: T }
export type MutationResult<T> = Success<T> | Failure

export function fail(status: Failure['status'], error: string): Failure {
  return { ok: false, status, error }
}

export function ok<T>(value: T): Success<T> {
  return { ok: true, value }
}
