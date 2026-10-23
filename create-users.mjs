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

const users = [
  { id: "a1000000-0000-0000-0000-000000000001", email: "ahmed@odc.com", full_name: "Ahmed Koroma", role: "student", student_id: "ODC-2026-001" },
  { id: "a1000000-0000-0000-0000-000000000002", email: "fatima@odc.com", full_name: "Fatima Kamara", role: "student", student_id: "ODC-2026-002" },
  { id: "a1000000-0000-0000-0000-000000000003", email: "omar@odc.com", full_name: "Omar Diallo", role: "student", student_id: "ODC-2026-003" },
  { id: "a1000000-0000-0000-0000-000000000004", email: "aisha@odc.com", full_name: "Aisha Bangura", role: "student", student_id: "ODC-2026-004" },
  { id: "a1000000-0000-0000-0000-000000000005", email: "mohamed@odc.com", full_name: "Mohamed Turay", role: "student", student_id: "ODC-2026-005" },
  { id: "a1000000-0000-0000-0000-000000000006", email: "ibrahim@odc.com", full_name: "Ibrahim Sesay", role: "student", student_id: "ODC-2026-006" },
  { id: "a1000000-0000-0000-0000-000000000007", email: "isata@odc.com", full_name: "Isata Conteh", role: "student", student_id: "ODC-2026-007" },
  { id: "a1000000-0000-0000-0000-000000000008", email: "joseph@odc.com", full_name: "Joseph Mansaray", role: "student", student_id: "ODC-2026-008" },
  { id: "b1000000-0000-0000-0000-000000000001", email: "sarah@odc.com", full_name: "Sarah Morgan", role: "tutor" },
  { id: "b1000000-0000-0000-0000-000000000002", email: "james@odc.com", full_name: "James Kamara", role: "tutor" },
  { id: "c1000000-0000-0000-0000-000000000001", email: "admin@odc.com", full_name: "Dr. Aminata Bangura", role: "admin" },
]

for (const u of users) {
  const { error } = await supabase.auth.admin.createUser({
    id: u.id,
    email: u.email,
    password: "password123",
    email_confirm: true,
    user_metadata: {
      full_name: u.full_name,
      role: u.role,
      student_id: u.student_id || undefined,
    },
  })
  if (error) console.log(`  FAIL ${u.email}: ${error.message}`)
  else console.log(`  OK   ${u.email}`)
}

console.log("Done creating users")
