const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

export function api(path: string): string {
  return `${API_BASE}${path}`
}

export async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(api(path), options)
  return res
}
