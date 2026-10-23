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

const classes = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Web Development 101", code: "WD101", description: "Introduction to HTML, CSS, and JavaScript" },
  { id: "22222222-2222-2222-2222-222222222222", name: "UI/UX Design Fundamentals", code: "UX201", description: "Design thinking, prototyping, and user research" },
  { id: "33333333-3333-3333-3333-333333333333", name: "Data Science Basics", code: "DS301", description: "Introduction to Python, pandas, and data visualization" },
  { id: "44444444-4444-4444-4444-444444444444", name: "AI Fundamentals", code: "AI101", description: "Machine learning concepts and neural networks" },
  { id: "55555555-5555-5555-5555-555555555555", name: "Mobile Development", code: "MD201", description: "React Native and Flutter basics" },
]

const classTutors = [
  { class_id: "11111111-1111-1111-1111-111111111111", tutor_id: "b1000000-0000-0000-0000-000000000001" },
  { class_id: "33333333-3333-3333-3333-333333333333", tutor_id: "b1000000-0000-0000-0000-000000000001" },
  { class_id: "55555555-5555-5555-5555-555555555555", tutor_id: "b1000000-0000-0000-0000-000000000001" },
  { class_id: "22222222-2222-2222-2222-222222222222", tutor_id: "b1000000-0000-0000-0000-000000000002" },
  { class_id: "44444444-4444-4444-4444-444444444444", tutor_id: "b1000000-0000-0000-0000-000000000002" },
]

const enrollments = [
  { user_id: "a1000000-0000-0000-0000-000000000001", class_id: "11111111-1111-1111-1111-111111111111" },
  { user_id: "a1000000-0000-0000-0000-000000000001", class_id: "22222222-2222-2222-2222-222222222222" },
  { user_id: "a1000000-0000-0000-0000-000000000001", class_id: "33333333-3333-3333-3333-333333333333" },
  { user_id: "a1000000-0000-0000-0000-000000000002", class_id: "11111111-1111-1111-1111-111111111111" },
  { user_id: "a1000000-0000-0000-0000-000000000002", class_id: "22222222-2222-2222-2222-222222222222" },
  { user_id: "a1000000-0000-0000-0000-000000000003", class_id: "11111111-1111-1111-1111-111111111111" },
  { user_id: "a1000000-0000-0000-0000-000000000003", class_id: "44444444-4444-4444-4444-444444444444" },
  { user_id: "a1000000-0000-0000-0000-000000000004", class_id: "11111111-1111-1111-1111-111111111111" },
  { user_id: "a1000000-0000-0000-0000-000000000004", class_id: "22222222-2222-2222-2222-222222222222" },
  { user_id: "a1000000-0000-0000-0000-000000000005", class_id: "11111111-1111-1111-1111-111111111111" },
  { user_id: "a1000000-0000-0000-0000-000000000005", class_id: "33333333-3333-3333-3333-333333333333" },
  { user_id: "a1000000-0000-0000-0000-000000000006", class_id: "22222222-2222-2222-2222-222222222222" },
  { user_id: "a1000000-0000-0000-0000-000000000007", class_id: "11111111-1111-1111-1111-111111111111" },
  { user_id: "a1000000-0000-0000-0000-000000000008", class_id: "33333333-3333-3333-3333-333333333333" },
]

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

function isoDay(n) {
  return daysAgo(n).toISOString().split("T")[0]
}

function isoTime(n, hour, minute = 0) {
  const d = daysAgo(n)
  d.setUTCHours(hour, minute, 0, 0)
  return d.toISOString()
}

const sessionDefs = [
  { class_id: "11111111-1111-1111-1111-111111111111", tutor_id: "b1000000-0000-0000-0000-000000000001", days: [14, 12, 10, 7, 5, 3], hour: 9 },
  { class_id: "22222222-2222-2222-2222-222222222222", tutor_id: "b1000000-0000-0000-0000-000000000002", days: [13, 11, 6, 4], hour: 11 },
  { class_id: "33333333-3333-3333-3333-333333333333", tutor_id: "b1000000-0000-0000-0000-000000000001", days: [14, 10, 7, 3], hour: 14 },
  { class_id: "44444444-4444-4444-4444-444444444444", tutor_id: "b1000000-0000-0000-0000-000000000002", days: [13, 6], hour: 9 },
]

const sessionIds = {}

function makeSession(classId, d) {
  const id = crypto.randomUUID()
  sessionIds[`${classId}_${d}`] = id
  const def = sessionDefs.find((s) => s.class_id === classId)
  return {
    id,
    class_id: classId,
    tutor_id: def.tutor_id,
    date: isoDay(d),
    start_time: isoTime(d, def.hour),
    end_time: isoTime(d, def.hour + 1, 30),
    is_active: false,
  }
}

const sessions = []
for (const def of sessionDefs) {
  for (const d of def.days) {
    sessions.push(makeSession(def.class_id, d))
  }
}

const attendance = []
for (const def of sessionDefs) {
  const enrolledStudents = enrollments.filter((e) => e.class_id === def.class_id).map((e) => e.user_id)
  for (let i = 0; i < def.days.length; i++) {
    const d = def.days[i]
    const sid = sessionIds[`${def.class_id}_${d}`]
    for (const studentId of enrolledStudents) {
      let status = "present"
      if (def.class_id === "11111111-1111-1111-1111-111111111111") {
        if (studentId === "a1000000-0000-0000-0000-000000000003" && (i + 1) % 3 === 0) status = "absent"
        if (studentId === "a1000000-0000-0000-0000-000000000005" && i === 3) status = "absent"
      }
      if (def.class_id === "22222222-2222-2222-2222-222222222222") {
        if (studentId === "a1000000-0000-0000-0000-000000000006" && i === 1) status = "absent"
      }
      if (def.class_id === "33333333-3333-3333-3333-333333333333") {
        if (studentId === "a1000000-0000-0000-0000-000000000008" && (i + 1) % 2 === 0) status = "absent"
      }
      attendance.push({
        session_id: sid,
        student_id: studentId,
        status,
        marked_at: status === "present" ? isoTime(d, def.hour, 2) : null,
        is_manual: false,
      })
    }
  }
}

async function main() {
  console.log("Inserting classes...")
  let r = await supabase.from("classes").upsert(classes, { onConflict: "id" })
  if (r.error) console.error("  Error:", r.error.message)
  else console.log(`  ${classes.length} classes inserted`)

  console.log("Inserting class_tutors...")
  await supabase.from("class_tutors").delete().gte("created_at", "2000-01-01")
  r = await supabase.from("class_tutors").insert(classTutors)
  if (r.error) console.error("  Error:", r.error.message)
  else console.log(`  ${classTutors.length} class_tutors inserted`)

  console.log("Inserting enrollments...")
  r = await supabase.from("enrollments").upsert(enrollments, { onConflict: "user_id,class_id" })
  if (r.error) console.error("  Error:", r.error.message)
  else console.log(`  ${enrollments.length} enrollments inserted`)

  console.log("Inserting sessions...")
  r = await supabase.from("sessions").insert(sessions)
  if (r.error) console.error("  Error:", r.error.message)
  else console.log(`  ${sessions.length} sessions inserted`)

  console.log("Inserting attendance...")
  r = await supabase.from("attendance_records").upsert(attendance, { onConflict: "session_id,student_id" })
  if (r.error) console.error("  Error:", r.error.message)
  else console.log(`  ${attendance.length} attendance records inserted`)

  console.log("Done!")
}

main().catch(console.error)
