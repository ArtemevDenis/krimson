import type { z } from 'zod'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

async function send(path: string, { method = 'GET', body }: RequestOptions): Promise<Response> {
  const init: RequestInit = { method }
  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  const res = await fetch(path, init)
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const data: unknown = await res.json()
      if (data && typeof data === 'object' && 'detail' in data) {
        const detail = (data as { detail: unknown }).detail
        message = typeof detail === 'string' ? detail : JSON.stringify(detail)
      }
    } catch {
      // non-JSON error body: keep status text
    }
    throw new ApiError(res.status, message)
  }
  return res
}

export async function request<S extends z.ZodType>(path: string, schema: S, options: RequestOptions = {}): Promise<z.infer<S>> {
  const res = await send(path, options)
  return schema.parse(await res.json())
}

export async function requestVoid(path: string, options: RequestOptions = {}): Promise<void> {
  await send(path, options)
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}
