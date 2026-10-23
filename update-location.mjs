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

const { data: records } = await supabase.from("attendance_records").select("id, session_id, student_id, status").eq("status", "present")

if (!records) { console.log("No records found"); process.exit(0) }

const baseLat = 8.4657
const baseLng = -13.2317

const updates = records.map((r) => ({
  id: r.id,
  latitude: baseLat + (Math.random() - 0.5) * 0.0004,
  longitude: baseLng + (Math.random() - 0.5) * 0.0004,
}))

let count = 0
for (const u of updates) {
  const { error } = await supabase.from("attendance_records").update({ latitude: u.latitude, longitude: u.longitude }).eq("id", u.id)
  if (error) console.log("Error:", error.message)
  else count++
}

console.log(`Updated ${count} records with location data`)