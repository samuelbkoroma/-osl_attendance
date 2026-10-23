import { randomBytes } from "crypto"

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

export function generateTempPassword(length = 8): string {
  const bytes = randomBytes(length)
  let out = ""
  for (let i = 0; i < length; i++) {
    out += CHARS[bytes[i] % CHARS.length]
  }
  return out
}