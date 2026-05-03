const SESSION_KEY = "petcare_session"

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_KEY)
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const t = getSessionToken()
  if (t) headers.set("Authorization", `Bearer ${t}`)
  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    const text = await res.text()
    let msg = res.statusText || `HTTP ${res.status}`
    const trimmed = text.trim()
    try {
      const j = JSON.parse(trimmed) as { error?: string }
      if (typeof j.error === "string") msg = j.error
    } catch {
      if (
        trimmed.includes("Cannot POST") ||
        trimmed.includes("Cannot GET") ||
        trimmed.startsWith("<!DOCTYPE")
      ) {
        msg =
          "The API on this port is not the PetCare server (or it is an old version). Close any other app using the API port, then in the app folder run npm run api and try again."
      }
    }
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}
