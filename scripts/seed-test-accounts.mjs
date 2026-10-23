import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(file, "utf8")
      for (const line of text.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (!m) continue
        const value = m[2].replace(/^["']|["']$/g, "")
        if (!process.env[m[1]]) process.env[m[1]] = value
      }
    } catch { /* skip */ }
  }
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error("Error: Missing Supabase credentials in .env.local")
  process.exit(1)
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TEST_PASSWORD = "Orange@2026"

const testUsers = [
  {
    email: "agness@orange-sonatel.com",
    full_name: "Agness Sonatel",
    role: "super_admin",
    rank: "director",
    job_title: "Super Administrator",
    branch: "HQ",
    dept: "HR"
  },
  {
    email: "director@orange.sl",
    full_name: "Director Orange",
    role: "hr_admin",
    rank: "director",
    job_title: "HR Director",
    branch: "HQ",
    dept: "HR"
  },
  {
    email: "manager@orange.sl",
    full_name: "Manager Orange",
    role: "branch_manager",
    rank: "manager",
    job_title: "Branch Manager",
    branch: "HQ",
    dept: "OPS"
  },
  {
    email: "staff@orange.sl",
    full_name: "Staff Orange",
    role: "employee",
    rank: "staff",
    job_title: "Operations Officer",
    branch: "HQ",
    dept: "OPS"
  }
]

async function cleanAndSeed() {
  console.log("--- Orange SL Test Account Cleanup & Seed ---")

  // 1. Get Reference Data
  const { data: branches } = await db.from("branches").select("id, code")
  const { data: schedules } = await db.from("work_schedules").select("id, code")
  const { data: departments } = await db.from("departments").select("id, code, branch_id")

  const hqBranch = branches?.find(b => b.code === "HQ")
  const stdSchedule = schedules?.find(s => s.code === "STD")

  if (!hqBranch || !stdSchedule) {
    console.error("Critical: HQ branch or STD schedule missing. Run migrations first.")
    return
  }

  for (const testUser of testUsers) {
    console.log(`Processing: ${testUser.email}...`)

    // A. Delete existing user if exists (to "erase all account" as requested)
    const { data: existingUsers } = await db.auth.admin.listUsers()
    const found = existingUsers.users.find(u => u.email === testUser.email)
    if (found) {
      await db.auth.admin.deleteUser(found.id)
      console.log(`  - Deleted existing ${testUser.email}`)
    }

    // B. Create Auth User
    const { data: newUser, error: authErr } = await db.auth.admin.createUser({
      email: testUser.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: testUser.full_name,
        role: testUser.role
      }
    })

    if (authErr) {
      console.error(`  ! Auth Error: ${authErr.message}`)
      continue
    }

    const userId = newUser.user.id

    // C. Create Employee Record
    const dept = departments?.find(d => d.branch_id === hqBranch.id && d.code === testUser.dept)

    const { error: empErr } = await db.from("employees").insert({
      user_id: userId,
      full_name: testUser.full_name,
      work_email: testUser.email,
      employee_no: `OSL-TEST-${testUser.role.slice(0, 3).toUpperCase()}`,
      branch_id: hqBranch.id,
      department_id: dept?.id || null,
      schedule_id: stdSchedule.id,
      job_title: testUser.job_title,
      rank: testUser.rank,
      employment_status: "active",
      hire_date: new Date().toISOString().split('T')[0]
    })

    if (empErr) {
      console.error(`  ! Employee Error: ${empErr.message}`)
    } else {
      console.log(`  + Seeded ${testUser.role}: ${testUser.email}`)
    }
  }

  console.log("\n--- SEED COMPLETE ---")
  console.log("Password for all: Orange@2026")
}

cleanAndSeed().catch(console.error)
