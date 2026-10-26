import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { generateTempPassword } from "@/lib/password"

// ============================================================================
// POST /api/employees/import — bulk-create employees from parsed spreadsheet
// rows. Mirrors POST /api/employees (same validation, auth user + employee row
// + welcome email per row) so an imported employee behaves exactly like one
// added by hand. Rows are processed sequentially and every outcome is
// individually reported so HR can share credentials row by row.
// ============================================================================

const USER_ROLES = ["super_admin", "hr_admin", "hr_officer", "branch_manager", "employee"] as const
const EMPLOYMENT_STATUSES = ["active", "inactive", "on_leave", "terminated"] as const
const EMPLOYEE_RANKS = [
  "ceo",
  "director",
  "senior_manager",
  "manager",
  "staff",
  "temporary_staff",
  "intern",
] as const

const MAX_ROWS = 200

interface ImportRow {
  full_name?: string
  email?: string
  phone?: string
  branch_id?: string
  department_id?: string
  team_id?: string
  job_title?: string
  schedule_id?: string
  hire_date?: string
  role?: string
  employment_status?: string
  rank?: string
  manager_id?: string | null
}

interface RowOutcome {
  row: number
  name: string
  email: string
  status: "created" | "error"
  temp_password?: string
  employee_id?: string
  employee_no?: string
  error?: string
}

async function getCaller(): Promise<{ userId: string; role: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile || (profile as { is_active: boolean }).is_active === false) return null
  return { userId: user.id, role: (profile as { role: string }).role }
}

function isHrAdmin(role: string): boolean {
  return role === "super_admin" || role === "hr_admin"
}

export async function POST(request: Request) {
  try {
    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    if (!isHrAdmin(caller.role)) {
      return NextResponse.json({ error: "Only HR administrators can import employees" }, { status: 403 })
    }

    const body = await request.json()
    const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : []
    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows to import" }, { status: 400 })
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Import is limited to ${MAX_ROWS} employees per batch. Split larger files.` },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Resolve names → ids once (branches/departments/teams/schedules/managers
    // may be supplied as either ids or names for spreadsheet convenience).
    const [{ data: branches }, { data: depts }, { data: teams }, { data: schedules }, { data: managers }] =
      await Promise.all([
        admin.from("branches").select("id, name, code"),
        admin.from("departments").select("id, name, branch_id"),
        admin.from("teams").select("id, name, department_id"),
        admin.from("work_schedules").select("id, name, code, is_active").eq("is_active", true),
        admin.from("employees").select("id, full_name").eq("employment_status", "active").limit(1000),
      ])
    const branchList = branches ?? []
    const deptList = depts ?? []
    const teamList = teams ?? []
    const scheduleList = schedules ?? []
    const managerList = managers ?? []
    const defaultSchedule = scheduleList.find((s) => s.code === "STD") ?? scheduleList[0]

    function resolveId(
      value: string | undefined,
      list: { id: string; name?: string; full_name?: string; code?: string }[],
      alsoCode = false
    ): string | null {
      const v = value?.trim()
      if (!v) return null
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v
      const found = list.find(
        (item) =>
          (item.name ?? item.full_name ?? "").toLowerCase() === v.toLowerCase() ||
          (alsoCode && (item.code ?? "").toLowerCase() === v.toLowerCase())
      )
      return found?.id ?? null
    }

    // Preload every known email so duplicates inside the batch and against the
    // DB are both caught before touching auth.
    const { data: existingEmployees } = await admin.from("employees").select("work_email")
    const { data: existingProfiles } = await admin.from("profiles").select("email")
    const knownEmails = new Set<string>([
      ...(existingEmployees ?? []).map((e) => (e.work_email ?? "").toLowerCase()),
      ...(existingProfiles ?? []).map((p) => (p.email ?? "").toLowerCase()),
    ].filter(Boolean))

    const seenInBatch = new Map<string, number>()
    const results: RowOutcome[] = []
    let created = 0
    let failed = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const name = String(row.full_name ?? "").trim()
      const email = String(row.email ?? "").trim().toLowerCase()
      const outcome: RowOutcome = { row: i + 2, name, email, status: "error" } // +2: row 1 is the header

      const fail = (error: string) => {
        outcome.error = error
        results.push(outcome)
        failed++
      }

      if (!name || !email) {
        fail("Full name and work email are required")
        continue
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fail("Invalid work email")
        continue
      }
      if (knownEmails.has(email)) {
        fail("An account already exists with this email")
        continue
      }
      if (seenInBatch.has(email)) {
        fail(`Duplicate of row ${seenInBatch.get(email)}`)
        continue
      }

      const branchId = resolveId(row.branch_id, branchList, true)
      if (!branchId) {
        fail(`Branch "${row.branch_id ?? ""}" not found (use branch name or code, e.g. HQ)`)
        continue
      }
      const departmentId = resolveId(row.department_id, deptList)
      if (row.department_id?.trim() && !departmentId) {
        fail(`Department "${row.department_id}" not found`)
        continue
      }
      const teamId = resolveId(row.team_id, teamList)
      if (row.team_id?.trim() && !teamId) {
        fail(`Team "${row.team_id}" not found`)
        continue
      }
      const scheduleId = defaultSchedule?.id ?? resolveId(row.schedule_id, scheduleList)
      if (!scheduleId) {
        fail("No active work schedule exists — create one first")
        continue
      }
      const role = (row.role ?? "employee").trim().toLowerCase()
      if (!USER_ROLES.includes(role as (typeof USER_ROLES)[number])) {
        fail(`Invalid role "${row.role}" (employee, branch_manager, hr_officer, hr_admin)`)
        continue
      }
      const rank = (row.rank ?? "staff").trim().toLowerCase()
      if (!EMPLOYEE_RANKS.includes(rank as (typeof EMPLOYEE_RANKS)[number])) {
        fail(`Invalid rank "${row.rank}"`)
        continue
      }
      const employmentStatus = (row.employment_status ?? "active").trim().toLowerCase()
      if (!EMPLOYMENT_STATUSES.includes(employmentStatus as (typeof EMPLOYMENT_STATUSES)[number])) {
        fail(`Invalid employment status "${row.employment_status}"`)
        continue
      }
      const managerId = resolveId(row.manager_id ?? undefined, managerList)
      if (row.manager_id?.trim() && !managerId) {
        fail(`Manager "${row.manager_id}" not found`)
        continue
      }
      const hireDate = String(row.hire_date ?? "").trim()
      if (hireDate && !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) {
        fail("Hire date must be YYYY-MM-DD")
        continue
      }

      seenInBatch.set(email, i + 2)

      const tempPassword = generateTempPassword(10)
      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          role,
          must_change_password: true,
        },
      })
      if (createError || !createdUser.user) {
        fail(createError?.message ?? "Failed to create the login account")
        continue
      }

      const { data: employee, error: insertError } = await admin
        .from("employees")
        .insert({
          user_id: createdUser.user.id,
          full_name: name,
          work_email: email,
          phone: String(row.phone ?? "").trim() || null,
          branch_id: branchId,
          department_id: departmentId,
          team_id: teamId,
          job_title: String(row.job_title ?? "").trim() || null,
          schedule_id: scheduleId,
          hire_date: hireDate || null,
          employment_status: employmentStatus,
          rank,
          manager_id: managerId,
          created_by: caller.userId,
        })
        .select("id, full_name, work_email, employee_no")
        .single()

      if (insertError) {
        await admin.auth.admin.deleteUser(createdUser.user.id)
        fail(insertError.message)
        continue
      }

      try {
        await admin.from("email_outbox").insert({
          to_email: email,
          subject: "Welcome to Orange Sierra Leone Attendance System",
          category: "auth.welcome",
          reference: `welcome:${createdUser.user.id}`,
          body_html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #ff7900;">Welcome, ${name}!</h2>
              <p>Your attendance account has been created. You can now log in to record your attendance and manage leave.</p>
              <div style="background: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Staff ID / Email:</strong> ${email}</p>
                <p style="margin: 5px 0 0 0;"><strong>Temporary Password:</strong> <code style="background: #eee; padding: 2px 4px;">${tempPassword}</code></p>
              </div>
              <p>For security, you will be required to change this password upon your first login.</p>
              <p>Best regards,<br/>Orange SL HR Team</p>
            </div>
          `,
          body_text: `Welcome ${name}! Your attendance account is ready. Login with ${email} and temporary password: ${tempPassword}. You must change this password on first login.`,
        })
      } catch (emailErr) {
        console.error("Failed to queue welcome email:", emailErr)
      }

      outcome.status = "created"
      outcome.temp_password = tempPassword
      outcome.employee_id = employee.id
      outcome.employee_no = (employee as { employee_no: string }).employee_no
      results.push(outcome)
      created++
      knownEmails.add(email)
    }

    return NextResponse.json({ success: true, summary: { created, failed }, results })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}
