import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const envPath = join(__dirname, ".env.local")
  const content = readFileSync(envPath, "utf8")
  const env = {}
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex === -1) continue
    env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1)
  }
  return env
}

const env = loadEnv()
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const sql = `
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS longitude double precision;
`

const { error } = await supabase.rpc("exec", { query: sql })
if (error) {
  console.log("RPC exec not available:", error.message)
  console.log("Please run the following SQL in Supabase SQL Editor:")
  console.log(sql)
} else {
  console.log("Migration applied successfully")
}