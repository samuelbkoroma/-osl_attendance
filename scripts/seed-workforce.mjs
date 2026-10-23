#!/usr/bin/env node
/**
 * Seeds a demo workforce for Orange Sierra Leone into the configured Supabase
 * project. Requires SUPABASE_SERVICE_ROLE_KEY. Idempotent — re-running updates
 * the same demo users/employees and skips existing attendance rows.
 *
 *   npm run seed:workforce
 */
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
    } catch {
      // file may not exist
    }
  }
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (check .env.local)")
  process.exit(1)
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DEMO_PASSWORD = "Orange@2026"

const staff = [
  {
    email: "ceo@orangesl.demo",
    full_name: "Adeola Johnson",
    role: "employee",
    rank: "ceo",
    job_title: "Chief Executive Officer",
    branch: "HQ",
    department: "OPS",
    schedule: "STD",
  },
  {
    email: "hr.director@orangesl.demo",
    full_name: "Aminata Kamara",
    role: "hr_admin",
    rank: "director",
    job_title: "HR Director",
    branch: "HQ",
    department: "HR",
    schedule: "STD",
  },
  {
    email: "hr.officer@orangesl.demo",
    full_name: "Mohamed Sesay",
    role: "hr_officer",
    rank: "staff",
    job_title: "HR Officer",
    branch: "HQ",
    department: "HR",
    schedule: "STD",
  },
  {
    email: "branch.manager@orangesl.demo",
    full_name: "Ibrahim Conteh",
    role: "branch_manager",
    rank: "manager",
    job_title: "Branch Manager",
    branch: "HQ",
    department: "OPS",
    schedule: "STD",
  },
  {
    email: "sales.senior@orangesl.demo",
    full_name: "Grace Williams",
    role: "employee",
    rank: "senior_manager",
    job_title: "Senior Sales Manager",
    branch: "HQ",
    department: "SALES",
    schedule: "STD",
  },
  { email: "fatmata.bangura@orangesl.demo", full_name: "Fatmata Bangura", rank: "staff", job_title: "Sales Executive", branch: "HQ", department: "SALES", schedule: "STD" },
  { email: "james.kaikai@orangesl.demo", full_name: "James Kaikai", rank: "staff", job_title: "Network Engineer", branch: "HQ", department: "IT", schedule: "STD" },
  { email: "mariama.jalloh@orangesl.demo", full_name: "Mariama Jalloh", rank: "staff", job_title: "Customer Care Agent", branch: "HQ", department: "CS", schedule: "CS1" },
  { email: "abu.koroma@orangesl.demo", full_name: "Abu Koroma", rank: "staff", job_title: "Finance Analyst", branch: "HQ", department: "FIN", schedule: "STD" },
  { email: "isatu.kamara@orangesl.demo", full_name: "Isatu Kamara", rank: "manager", job_title: "Sales Supervisor", branch: "BO", department: "SALES", schedule: "STD" },
  { email: "sorie.mansaray@orangesl.demo", full_name: "Sorie Mansaray", rank: "staff", job_title: "Operations Officer", branch: "BO", department: "OPS", schedule: "EARLY" },
  { email: "hawa.tarawally@orangesl.demo", full_name: "Hawa Tarawally", rank: "temporary_staff", job_title: "Customer Care Agent (XL)", branch: "KEN", department: "CS", schedule: "CS1" },
  { email: "paul.lamin@orangesl.demo", full_name: "Paul Lamin", rank: "temporary_staff", job_title: "Sales Executive (XL)", branch: "KEN", department: "SALES", schedule: "STD" },
  { email: "zainab.fofanah@orangesl.demo", full_name: "Zainab Fofanah", rank: "staff", job_title: "Operations Officer", branch: "MAK", department: "OPS", schedule: "STD" },
  { email: "alhaji.dumbuya@orangesl.demo", full_name: "Alhaji Dumbuya", rank: "intern", job_title: "Retail Advisor (Intern)", branch: "RTL-1", department: "SALES", schedule: "CS1" },
  { email: "kadiatu.sesay@orangesl.demo", full_name: "Kadiatu Sesay", rank: "temporary_staff", job_title: "Field Technician (XL)", branch: "TECH", department: "OPS", schedule: "EARLY" },
  { email: "osman.bah@orangesl.demo", full_name: "Osman Bah", rank: "intern", job_title: "Retail Advisor (Intern)", branch: "RTL-1", department: "CS", schedule: "STD" },
  {
    email: "abm.manager@orangesl.demo",
    full_name: "Sulaiman Turay",
    role: "branch_manager",
    rank: "manager",
    job_title: "ABM Area Branch Manager",
    branch: "ABM",
    department: "OPS",
    schedule: "STD",
  },
  { email: "amina.sillah@orangesl.demo", full_name: "Amina Sillah", rank: "staff", job_title: "Customer Care Agent", branch: "ABM", department: "CS", schedule: "CS1" },
  { email: "ibrahim.jalloh@orangesl.demo", full_name: "Ibrahim Jalloh", rank: "staff", job_title: "Sales Executive", branch: "ABM", department: "SALES", schedule: "STD" },
  { email: "memuna.kargbo@orangesl.demo", full_name: "Memuna Kargbo", rank: "temporary_staff", job_title: "Field Technician (XL)", branch: "ABM", department: "OPS", schedule: "EARLY" },
]

// Reporting lines: junior email -> manager email. The alert chain climbs these.
const reportingLines = {
  "hr.officer@orangesl.demo": "hr.director@orangesl.demo",
  "branch.manager@orangesl.demo": "hr.director@orangesl.demo",
  "sales.senior@orangesl.demo": "branch.manager@orangesl.demo",
  "fatmata.bangura@orangesl.demo": "sales.senior@orangesl.demo",
  "abu.koroma@orangesl.demo": "hr.director@orangesl.demo",
  "james.kaikai@orangesl.demo": "branch.manager@orangesl.demo",
  "mariama.jalloh@orangesl.demo": "branch.manager@orangesl.demo",
  "isatu.kamara@orangesl.demo": "sales.senior@orangesl.demo",
  "sorie.mansaray@orangesl.demo": "isatu.kamara@orangesl.demo",
  "hawa.tarawally@orangesl.demo": "isatu.kamara@orangesl.demo",
  "paul.lamin@orangesl.demo": "isatu.kamara@orangesl.demo",
  "zainab.fofanah@orangesl.demo": "branch.manager@orangesl.demo",
  "alhaji.dumbuya@orangesl.demo": "fatmata.bangura@orangesl.demo",
  "kadiatu.sesay@orangesl.demo": "branch.manager@orangesl.demo",
  "osman.bah@orangesl.demo": "branch.manager@orangesl.demo",
  "abm.manager@orangesl.demo": "hr.director@orangesl.demo",
  "amina.sillah@orangesl.demo": "abm.manager@orangesl.demo",
  "ibrahim.jalloh@orangesl.demo": "abm.manager@orangesl.demo",
  "memuna.kargbo@orangesl.demo": "abm.manager@orangesl.demo",
  "hr.director@orangesl.demo": "ceo@orangesl.demo",
  "sales.senior@orangesl.demo": "ceo@orangesl.demo",
}

function freeTownDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return d.toISOString().slice(0, 10)
}

function weekdayOf(dateStr) {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay() // 0 Sun .. 6 Sat
  return day === 0 ? 7 : day
}

function scheduleStart(scheduleCode) {
  if (scheduleCode === "EARLY") return "07:00"
  if (scheduleCode === "CS1") return "09:00"
  return "08:00"
}

function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(":").map(Number)
  const total = h * 60 + m + minutes
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0")
  const mm = String(total % 60).padStart(2, "0")
  return `${hh}:${mm}`
}

async function main() {
  console.log(`Seeding workforce into ${url}`)

  const { data: branches, error: branchErr } = await db.from("branches").select("id, code, latitude, longitude")
  if (branchErr) throw branchErr
  const branchByCode = new Map(branches.map((b) => [b.code, b]))

  const { data: departments, error: deptErr } = await db.from("departments").select("id, branch_id, code")
  if (deptErr) throw deptErr

  const { data: schedules, error: schedErr } = await db.from("work_schedules").select("id, code")
  if (schedErr) throw schedErr
  const scheduleByCode = new Map(schedules.map((s) => [s.code, s]))

  if (branchByCode.size === 0 || scheduleByCode.size === 0) {
    throw new Error(
      "Reference data missing. Run migrations 020–025 (024 seeds branches/schedules) before seeding."
    )
  }

  const employees = []

  const { data: userList, error: userListErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (userListErr) throw userListErr
  const usersByEmail = new Map(userList.users.map((u) => [u.email?.toLowerCase(), u]))

  for (const person of staff) {
    const branch = branchByCode.get(person.branch)
    if (!branch) {
      console.warn(`  ! branch ${person.branch} not found, skipping ${person.email}`)
      continue
    }
    const schedule = scheduleByCode.get(person.schedule) ?? scheduleByCode.get("STD")
    const department =
      departments.find((d) => d.branch_id === branch.id && d.code === person.department) ??
      departments.find((d) => d.branch_id === branch.id)

    let user = usersByEmail.get(person.email.toLowerCase())

    if (!user) {
      const { data, error } = await db.auth.admin.createUser({
        email: person.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: person.full_name,
          role: person.role ?? "employee",
          must_change_password: false,
        },
      })
      if (error) throw error
      user = data.user
      usersByEmail.set(person.email.toLowerCase(), user)
      console.log(`  + user ${person.email}`)
    }

    const { data: existingEmployee } = await db
      .from("employees")
      .select("id")
      .eq("work_email", person.email)
      .maybeSingle()

    const employeePayload = {
      full_name: person.full_name,
      work_email: person.email,
      branch_id: branch.id,
      department_id: department?.id ?? null,
      job_title: person.job_title,
      schedule_id: schedule.id,
      user_id: user.id,
      employment_status: "active",
      rank: person.rank ?? "staff",
      hire_date: "2024-01-15",
    }

    let employee
    if (existingEmployee) {
      const { data, error } = await db
        .from("employees")
        .update(employeePayload)
        .eq("id", existingEmployee.id)
        .select("id, full_name, work_email, branch_id, department_id, schedule_id")
        .single()
      if (error) throw error
      employee = data
    } else {
      const { data, error } = await db
        .from("employees")
        .insert(employeePayload)
        .select("id, full_name, work_email, branch_id, department_id, schedule_id")
        .single()
      if (error) throw error
      employee = data
      console.log(`  + employee ${person.full_name}`)
    }
    employees.push({ ...employee, scheduleCode: person.schedule, role: person.role ?? "employee" })
  }

  // Branch manager assignment — one branch_manager per branch.
  const branchManagerByBranch = new Map()
  for (const person of staff) {
    if (person.role !== "branch_manager") continue
    const emp = employees.find((e) => e.work_email === person.email)
    const branch = branchByCode.get(person.branch)
    if (emp && branch) branchManagerByBranch.set(branch.id, emp.id)
  }
  for (const [branchId, managerId] of branchManagerByBranch) {
    await db.from("branches").update({ manager_id: managerId }).eq("id", branchId)
  }

  // Reporting lines (line managers) — powers the missed-clock-in alert chain.
  const byEmail = new Map(employees.map((e) => [e.work_email, e]))
  for (const [email, managerEmail] of Object.entries(reportingLines)) {
    const emp = byEmail.get(email)
    const mgr = byEmail.get(managerEmail)
    if (!emp || !mgr) continue
    await db.from("employees").update({ manager_id: mgr.id }).eq("id", emp.id)
  }
  console.log("  + reporting lines linked")

  // ---------------------------------------------------------------------------
  // Approved leave (two days ago through two days ahead) for one employee
  // ---------------------------------------------------------------------------
  const leaveEmployee = employees.find((e) => e.work_email === "mariama.jalloh@orangesl.demo")
  if (leaveEmployee) {
    const { data: existingLeave } = await db
      .from("leave_requests")
      .select("id")
      .eq("employee_id", leaveEmployee.id)
      .eq("start_date", freeTownDate(-2))
      .maybeSingle()
    if (!existingLeave) {
      await db.from("leave_requests").insert({
        employee_id: leaveEmployee.id,
        leave_type: "annual",
        start_date: freeTownDate(-2),
        end_date: freeTownDate(2),
        reason: "Annual leave — family visit",
        status: "approved",
        reviewed_at: new Date().toISOString(),
      })
      console.log("  + approved leave (5 days)")
    }
  }

  // Pending leave + correction for the review queues
  const pendingLeaveEmployee = employees.find((e) => e.work_email === "paul.lamin@orangesl.demo")
  if (pendingLeaveEmployee) {
    const { data: existing } = await db
      .from("leave_requests")
      .select("id")
      .eq("employee_id", pendingLeaveEmployee.id)
      .eq("status", "pending")
      .maybeSingle()
    if (!existing) {
      await db.from("leave_requests").insert({
        employee_id: pendingLeaveEmployee.id,
        leave_type: "sick",
        start_date: freeTownDate(2),
        end_date: freeTownDate(3),
        reason: "Medical appointment in Freetown",
      })
      console.log("  + pending leave request")
    }
  }

  const correctionEmployee = employees.find((e) => e.work_email === "hawa.tarawally@orangesl.demo")
  if (correctionEmployee) {
    const workDate = freeTownDate(-1)
    const { data: existing } = await db
      .from("attendance_correction_requests")
      .select("id")
      .eq("employee_id", correctionEmployee.id)
      .eq("work_date", workDate)
      .maybeSingle()
    if (!existing) {
      await db.from("attendance_correction_requests").insert({
        employee_id: correctionEmployee.id,
        work_date: workDate,
        proposed_check_in: `${workDate}T09:02:00Z`,
        proposed_check_out: `${workDate}T18:05:00Z`,
        reason: "Kiosk was offline when I arrived",
      })
      console.log("  + pending correction request")
    }
  }

  // ---------------------------------------------------------------------------
  // Past attendance: insert check-ins, then run the real cutoff function so the
  // statuses and daily reports are produced exactly as production would.
  // ---------------------------------------------------------------------------
  const pastDates = []
  let offset = -1
  while (pastDates.length < 6 && offset > -30) {
    const date = freeTownDate(offset)
    if (weekdayOf(date) <= 5) pastDates.push(date) // weekdays only
    offset -= 1
  }

  const employeeRows = employees.filter((e) => e.role === "employee")

  for (const [dateIndex, date] of pastDates.entries()) {
    const rows = []
    employeeRows.forEach((emp, i) => {
      const day = weekdayOf(date)
      if (day > 5) return
      const pattern = (i * 7 + dateIndex * 3) % 20 // deterministic spread
      const start = scheduleStart(emp.scheduleCode)
      const branch = branchByCode.get(staff.find((s) => s.email === emp.work_email)?.branch ?? "HQ")

      if (pattern >= 17) return // absent: no row, cutoff will classify

      const late = pattern >= 13
      const minutes = late ? 12 + (pattern % 4) * 9 : -(20 + (pattern % 3) * 7)
      const checkIn = addMinutes(start, minutes)

      rows.push({
        employee_id: emp.id,
        work_date: date,
        branch_id: emp.branch_id,
        department_id: emp.department_id,
        schedule_id: emp.schedule_id,
        check_in: `${date}T${checkIn}:00Z`,
        check_out: `${date}T${addMinutes(start, 9 * 60 + 12)}:00Z`,
        source: "self",
        within_branch: true,
        latitude: branch?.latitude ?? null,
        longitude: branch?.longitude ?? null,
      })
    })

    if (rows.length > 0) {
      const { error } = await db
        .from("attendance_records")
        .upsert(rows, { onConflict: "employee_id,work_date", ignoreDuplicates: true })
      if (error) throw error
    }

    const { error: cutoffErr } = await db.rpc("process_daily_cutoff", {
      p_date: date,
      p_force: true,
    })
    if (cutoffErr) throw cutoffErr
    console.log(`  + attendance + 08:45 report for ${date}`)
  }

  console.log("\nDone. Demo accounts (password: %s):", DEMO_PASSWORD)
  for (const person of staff) console.log(`  ${person.role ?? "employee"}: ${person.email}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
