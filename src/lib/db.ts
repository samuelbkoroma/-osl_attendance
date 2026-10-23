// ============================================================================
// Workforce data access — browser client, RLS-scoped.
// Mutations that need the service role (auth user lifecycle) go through
// /api/employees; attendance itself is only ever written via RPCs.
// ============================================================================

import { createClient } from "@/lib/supabase/client"
import { freeTownDate } from "@/lib/attendance"
import type {
  AppNotification,
  AttendanceRecord,
  AttendanceSource,
  AttendanceStatus,
  AuditLog,
  Branch,
  CheckInResult,
  CheckOutResult,
  CorrectionRequest,
  CorrectionStatus,
  CutoffRunResult,
  DailyAttendanceReport,
  Department,
  EmailOutboxItem,
  Employee,
  EmployeeRank,
  EmploymentStatus,
  Holiday,
  IssuedEmployee,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  OrgSettings,
  Profile,
  Team,
  UserRole,
  WorkSchedule,
} from "@/types"

type Supabase = ReturnType<typeof createClient>

function getClient(): Supabase {
  return createClient()
}

type QueryResult = { data: unknown; error: { message: string } | null }

async function unwrap<T>(input: PromiseLike<QueryResult> | QueryResult): Promise<T> {
  const res = await input
  if (res.error) throw new Error(res.error.message)
  if (res.data === null) throw new Error("No data returned")
  return res.data as T
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = getClient()
  return unwrap<T>(await supabase.rpc(fn, args))
}

// PostgREST relationship hints: employees <-> branches and employees <-> teams
// each have TWO foreign keys (the org-placement FK plus the manager/lead
// back-reference), so embeds must be disambiguated by the COLUMN name, which
// is stable regardless of how the constraint was named.
const EMPLOYEE_SELECT =
  "*, branch:branches!branch_id(*), department:departments(*), team:teams!team_id(*), " +
  "schedule:work_schedules(*), manager:employees!manager_id(id, full_name, employee_no, job_title, rank, work_email), " +
  "profile:profiles!employees_user_id_profile_fkey(*)"

const ATTENDANCE_SELECT =
  "*, employee:employees(" + EMPLOYEE_SELECT + "), branch:branches(*), schedule:work_schedules(*)"

const LEAVE_SELECT = "*, employee:employees(" + EMPLOYEE_SELECT + ")"
const CORRECTION_SELECT = "*, employee:employees(" + EMPLOYEE_SELECT + ")"

// ---------------------------------------------------------------------------
// Profile & org settings
// ---------------------------------------------------------------------------

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = getClient()
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
  return data as Profile | null
}

export async function getProfilesByIds(ids: string[]): Promise<Profile[]> {
  if (ids.length === 0) return []
  const supabase = getClient()
  const { data } = await supabase.from("profiles").select("*").in("id", ids)
  return (data as Profile[]) ?? []
}

export async function updateProfileSelf(patch: {
  full_name?: string
  avatar_url?: string | null
}): Promise<Profile> {
  const supabase = getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  return unwrap(await supabase.from("profiles").update(patch).eq("id", user.id).select("*").single())
}

export async function getOrgSettings(): Promise<OrgSettings | null> {
  const supabase = getClient()
  const { data } = await supabase.from("org_settings").select("*").eq("id", 1).maybeSingle()
  return data as OrgSettings | null
}

export async function updateOrgSettings(patch: Partial<OrgSettings>): Promise<OrgSettings> {
  const supabase = getClient()
  const { data: { user } } = await supabase.auth.getUser()
  return unwrap(
    await supabase
      .from("org_settings")
      .update({ ...patch, updated_by: user?.id ?? null })
      .eq("id", 1)
      .select("*")
      .single()
  )
}

// ---------------------------------------------------------------------------
// Branch / department / team / schedule / holiday directories
// ---------------------------------------------------------------------------

export async function getBranches(opts: { activeOnly?: boolean } = {}): Promise<Branch[]> {
  const supabase = getClient()
  let query = supabase
    .from("branches")
    .select("*, manager:employees!branches_manager_id_fkey(id, full_name, employee_no)")
    .order("name")
  if (opts.activeOnly) query = query.eq("is_active", true)
  return (await unwrap(query)) as Branch[]
}

export async function createBranch(
  input: Pick<Branch, "name" | "code"> & Partial<Branch>
): Promise<Branch> {
  const supabase = getClient()
  return unwrap(await supabase.from("branches").insert(input).select("*").single())
}

export async function updateBranch(id: string, patch: Partial<Branch>): Promise<Branch> {
  const supabase = getClient()
  return unwrap(await supabase.from("branches").update(patch).eq("id", id).select("*").single())
}

export async function getDepartments(branchId?: string): Promise<Department[]> {
  const supabase = getClient()
  let query = supabase
    .from("departments")
    .select("*, branch:branches(id, name, code)")
    .order("name")
  if (branchId) query = query.eq("branch_id", branchId)
  return (await unwrap(query)) as Department[]
}

export async function createDepartment(
  input: Pick<Department, "branch_id" | "name"> & Partial<Department>
): Promise<Department> {
  const supabase = getClient()
  return unwrap(await supabase.from("departments").insert(input).select("*").single())
}

export async function updateDepartment(id: string, patch: Partial<Department>): Promise<Department> {
  const supabase = getClient()
  return unwrap(await supabase.from("departments").update(patch).eq("id", id).select("*").single())
}

export async function getTeams(departmentId?: string): Promise<Team[]> {
  const supabase = getClient()
  let query = supabase.from("teams").select("*").order("name")
  if (departmentId) query = query.eq("department_id", departmentId)
  return (await unwrap(query)) as Team[]
}

export async function createTeam(
  input: Pick<Team, "department_id" | "name"> & Partial<Team>
): Promise<Team> {
  const supabase = getClient()
  return unwrap(await supabase.from("teams").insert(input).select("*").single())
}

export async function updateTeam(id: string, patch: Partial<Team>): Promise<Team> {
  const supabase = getClient()
  return unwrap(await supabase.from("teams").update(patch).eq("id", id).select("*").single())
}

export async function getSchedules(opts: { activeOnly?: boolean } = {}): Promise<WorkSchedule[]> {
  const supabase = getClient()
  let query = supabase.from("work_schedules").select("*").order("name")
  if (opts.activeOnly) query = query.eq("is_active", true)
  return (await unwrap(query)) as WorkSchedule[]
}

export async function createSchedule(
  input: Pick<WorkSchedule, "name" | "work_days" | "start_time" | "end_time"> &
    Partial<WorkSchedule>
): Promise<WorkSchedule> {
  const supabase = getClient()
  return unwrap(await supabase.from("work_schedules").insert(input).select("*").single())
}

export async function updateSchedule(id: string, patch: Partial<WorkSchedule>): Promise<WorkSchedule> {
  const supabase = getClient()
  return unwrap(await supabase.from("work_schedules").update(patch).eq("id", id).select("*").single())
}

export async function getHolidays(year?: number): Promise<Holiday[]> {
  const supabase = getClient()
  let query = supabase
    .from("holidays")
    .select("*, branch:branches(id, name, code)")
    .order("holiday_date", { ascending: false })
  if (year) {
    query = query.gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`)
  }
  return (await unwrap(query)) as Holiday[]
}

export async function createHoliday(
  input: Pick<Holiday, "name" | "holiday_date"> & Partial<Holiday>
): Promise<Holiday> {
  const supabase = getClient()
  return unwrap(await supabase.from("holidays").insert(input).select("*").single())
}

export async function deleteHoliday(id: string): Promise<void> {
  const supabase = getClient()
  await unwrap(await supabase.from("holidays").delete().eq("id", id).select("id"))
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export interface EmployeeFilters {
  query?: string
  branchId?: string
  departmentId?: string
  status?: EmploymentStatus | "all"
  rank?: EmployeeRank | "all"
  limit?: number
}

export async function getEmployees(filters: EmployeeFilters = {}): Promise<Employee[]> {
  const supabase = getClient()
  let query = supabase.from("employees").select(EMPLOYEE_SELECT).order("full_name")

  if (filters.branchId) query = query.eq("branch_id", filters.branchId)
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId)
  if (filters.status && filters.status !== "all") query = query.eq("employment_status", filters.status)
  if (filters.rank && filters.rank !== "all") query = query.eq("rank", filters.rank)
  if (filters.limit) query = query.limit(filters.limit)

  const q = filters.query?.trim()
  if (q) {
    query = query.or(`full_name.ilike.*${q}*,work_email.ilike.*${q}*,employee_no.ilike.*${q}*,job_title.ilike.*${q}*`)
  }

  return (await unwrap(query)) as Employee[]
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const supabase = getClient()
  const { data } = await supabase.from("employees").select(EMPLOYEE_SELECT).eq("id", id).maybeSingle()
  return data as Employee | null
}

export async function getMyEmployee(
  userId: string
): Promise<{ employee: Employee; schedule: WorkSchedule; settings: OrgSettings } | null> {
  const supabase = getClient()
  const [empRes, settingsRes] = await Promise.all([
    supabase
      .from("employees")
      .select("*, schedule:work_schedules(*), branch:branches!branch_id(*), department:departments(*)")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("org_settings").select("*").eq("id", 1).maybeSingle(),
  ])
  if (empRes.error) throw new Error(empRes.error.message)
  if (!empRes.data) return null
  const employee = empRes.data as Employee & { schedule: WorkSchedule }
  const settings = settingsRes.data as OrgSettings | null
  if (!employee.schedule) throw new Error("Your work schedule is not configured")
  if (!settings) throw new Error("Organisation settings are missing")
  return { employee, schedule: employee.schedule, settings }
}

export interface CreateEmployeePayload {
  full_name: string
  email: string
  phone?: string | null
  branch_id: string
  department_id?: string | null
  team_id?: string | null
  job_title?: string | null
  schedule_id: string
  hire_date?: string | null
  role?: UserRole
  employment_status?: EmploymentStatus
  rank?: EmployeeRank
  manager_id?: string | null
}

/** Creates the auth user + employee row server-side (needs the service role). */
export async function createEmployee(payload: CreateEmployeePayload): Promise<IssuedEmployee> {
  const res = await fetch("/api/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Failed to create employee")
  return { ...(data.employee as Employee), tempPassword: data.tempPassword as string | undefined }
}

export async function updateEmployee(id: string, patch: Partial<Employee>): Promise<Employee> {
  const supabase = getClient()
  return unwrap(await supabase.from("employees").update(patch).eq("id", id).select("*").single())
}

export type EmployeeAdminAction =
  | { action: "reset_password"; employeeId: string }
  | { action: "set_role"; userId: string; role: UserRole }
  | { action: "set_profile_active"; userId: string; isActive: boolean }

export interface EmployeeAdminResult {
  success: boolean
  tempPassword?: string
}

export async function employeeAdminAction(
  payload: EmployeeAdminAction
): Promise<EmployeeAdminResult> {
  const res = await fetch("/api/employees", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Action failed")
  return data as EmployeeAdminResult
}

// ---------------------------------------------------------------------------
// Attendance — self service (RPCs)
// ---------------------------------------------------------------------------

export async function checkIn(latitude?: number, longitude?: number): Promise<CheckInResult> {
  return rpc<CheckInResult>("employee_check_in", {
    p_latitude: latitude ?? null,
    p_longitude: longitude ?? null,
  })
}

export async function checkOut(): Promise<CheckOutResult> {
  return rpc<CheckOutResult>("employee_check_out")
}

export async function getMyAttendance(filters: {
  from?: string
  to?: string
  status?: AttendanceStatus | "all"
  limit?: number
} = {}): Promise<AttendanceRecord[]> {
  const supabase = getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!emp) return []

  let query = supabase
    .from("attendance_records")
    .select("*, schedule:work_schedules(*), branch:branches(id, name, code)")
    .eq("employee_id", (emp as { id: string }).id)
    .order("work_date", { ascending: false })
    .limit(filters.limit ?? 120)

  if (filters.from) query = query.gte("work_date", filters.from)
  if (filters.to) query = query.lte("work_date", filters.to)
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status)

  return (await unwrap(query)) as AttendanceRecord[]
}

export async function getMyTodayRecord(userId: string): Promise<AttendanceRecord | null> {
  const supabase = getClient()
  const { data: emp } = await supabase.from("employees").select("id").eq("user_id", userId).maybeSingle()
  if (!emp) return null
  const { data } = await supabase
    .from("attendance_records")
    .select("*, schedule:work_schedules(*)")
    .eq("employee_id", (emp as { id: string }).id)
    .eq("work_date", freeTownDate())
    .maybeSingle()
  return data as unknown as AttendanceRecord | null
}

// ---------------------------------------------------------------------------
// Attendance — HR / manager views (RLS-scoped reads)
// ---------------------------------------------------------------------------

export interface AttendanceFilters {
  date?: string
  from?: string
  to?: string
  branchId?: string
  departmentId?: string
  status?: AttendanceStatus | "all"
  source?: AttendanceSource | "all"
  withinBranch?: "all" | "inside" | "outside"
  cutoffAbsentOnly?: boolean
  query?: string
  limit?: number
}

export async function getAttendance(filters: AttendanceFilters = {}): Promise<AttendanceRecord[]> {
  const supabase = getClient()
  const employeeIds = await resolveEmployeeIds(supabase, filters.query)
  const query = buildAttendanceQuery(supabase, filters, employeeIds, { limit: filters.limit ?? 500 })
  return (await unwrap(query)) as AttendanceRecord[]
}

/**
 * Every matching attendance row, for CSV/Excel export.
 *
 * The on-screen table deliberately caps at 500 rows so the browser stays
 * responsive, but an export has to be complete. This pages through the same
 * filters with `range()` until the server runs out of rows.
 */
export async function getAttendanceForExport(
  filters: AttendanceFilters = {}
): Promise<AttendanceRecord[]> {
  const supabase = getClient()
  const employeeIds = await resolveEmployeeIds(supabase, filters.query)
  const PAGE = 1000
  const MAX_ROWS = 50_000
  const rows: AttendanceRecord[] = []

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const query = buildAttendanceQuery(supabase, filters, employeeIds, {
      offset,
      size: PAGE,
    })
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as unknown as AttendanceRecord[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }

  return rows
}

/** Resolves a free-text employee search to a list of employee ids. */
async function resolveEmployeeIds(
  supabase: Supabase,
  query?: string
): Promise<string[] | undefined> {
  const q = query?.trim()
  if (!q) return undefined
  const matches = await supabase
    .from("employees")
    .select("id")
    .or(`full_name.ilike.*${q}*,employee_no.ilike.*${q}*`)
    .limit(1000)
  if (matches.error) throw new Error(matches.error.message)
  const ids = (matches.data as { id: string }[]).map((e) => e.id)
  return ids.length === 0 ? [] : ids
}

/**
 * Shared attendance query builder. Pass `limit` for a single capped page, or
 * `offset`/`size` to page through the full result set.
 */
function buildAttendanceQuery(
  supabase: Supabase,
  filters: AttendanceFilters,
  employeeIds: string[] | undefined,
  page: { limit: number } | { offset: number; size: number }
) {
  let query = supabase
    .from("attendance_records")
    .select(ATTENDANCE_SELECT)
    .order("work_date", { ascending: false })
    .order("check_in", { ascending: false, nullsFirst: false })

  if ("limit" in page) {
    query = query.limit(page.limit)
  } else {
    query = query.range(page.offset, page.offset + page.size - 1)
  }

  if (filters.date) query = query.eq("work_date", filters.date)
  if (filters.from) query = query.gte("work_date", filters.from)
  if (filters.to) query = query.lte("work_date", filters.to)
  if (filters.branchId) query = query.eq("branch_id", filters.branchId)
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId)
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status)
  if (filters.source && filters.source !== "all") query = query.eq("source", filters.source)
  if (filters.withinBranch === "inside") query = query.eq("within_branch", true)
  if (filters.withinBranch === "outside") query = query.eq("within_branch", false)
  if (filters.cutoffAbsentOnly) query = query.eq("cutoff_status", "absent")
  if (employeeIds) query = query.in("employee_id", employeeIds)

  return query
}

/** Backfilled / amended attendance by HR (security-definer RPC). */
export async function hrRecordAttendance(input: {
  employee_id: string
  work_date: string
  check_in?: string | null
  check_out?: string | null
  reason: string
}): Promise<AttendanceRecord> {
  await rpc("hr_record_attendance", {
    p_employee_id: input.employee_id,
    p_work_date: input.work_date,
    p_check_in: input.check_in ?? null,
    p_check_out: input.check_out ?? null,
    p_reason: input.reason,
  })
  const supabase = getClient()
  const { data } = await supabase
    .from("attendance_records")
    .select(ATTENDANCE_SELECT)
    .eq("employee_id", input.employee_id)
    .eq("work_date", input.work_date)
    .maybeSingle()
  return data as unknown as AttendanceRecord
}

// ---------------------------------------------------------------------------
// Daily cutoff report
// ---------------------------------------------------------------------------

export async function getDailyReport(date: string): Promise<DailyAttendanceReport | null> {
  const supabase = getClient()
  const { data } = await supabase
    .from("daily_attendance_reports")
    .select("*")
    .eq("report_date", date)
    .maybeSingle()
  return data as DailyAttendanceReport | null
}

export async function getDailyReports(limit = 30): Promise<DailyAttendanceReport[]> {
  const supabase = getClient()
  return (await unwrap(
    supabase
      .from("daily_attendance_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(limit)
  )) as DailyAttendanceReport[]
}

export async function regenerateDailyReport(date: string): Promise<CutoffRunResult> {
  return rpc<CutoffRunResult>("regenerate_daily_report", { p_date: date })
}

/** Manual/forced run of the 08:45 cutoff process (HR only; guarded in SQL). */
export async function processDailyCutoff(
  date?: string,
  force = true
): Promise<CutoffRunResult> {
  return rpc<CutoffRunResult>("process_daily_cutoff", {
    p_date: date ?? null,
    p_force: force,
  })
}

// ---------------------------------------------------------------------------
// Leave requests
// ---------------------------------------------------------------------------

export async function getMyLeaveRequests(): Promise<LeaveRequest[]> {
  const supabase = getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data: emp } = await supabase.from("employees").select("id").eq("user_id", user.id).maybeSingle()
  if (!emp) return []
  return (await unwrap(
    supabase
      .from("leave_requests")
      .select("*")
      .eq("employee_id", (emp as { id: string }).id)
      .order("start_date", { ascending: false })
      .limit(100)
  )) as LeaveRequest[]
}

export async function getLeaveRequests(filters: {
  status?: LeaveStatus | "all"
  branchId?: string
} = {}): Promise<LeaveRequest[]> {
  const supabase = getClient()
  let employeeIds: string[] | undefined
  if (filters.branchId) {
    const { data, error } = await supabase
      .from("employees")
      .select("id")
      .eq("branch_id", filters.branchId)
    if (error) throw new Error(error.message)
    employeeIds = (data as { id: string }[]).map((e) => e.id)
    if (employeeIds.length === 0) return []
  }

  let query = supabase
    .from("leave_requests")
    .select(LEAVE_SELECT)
    .order("created_at", { ascending: false })
    .limit(300)
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status)
  if (employeeIds) query = query.in("employee_id", employeeIds)

  return (await unwrap(query)) as LeaveRequest[]
}

export async function submitLeaveRequest(input: {
  leave_type: LeaveType
  start_date: string
  end_date: string
  reason?: string
}): Promise<LeaveRequest> {
  return rpc<LeaveRequest>("submit_leave_request", {
    p_leave_type: input.leave_type,
    p_start_date: input.start_date,
    p_end_date: input.end_date,
    p_reason: input.reason ?? null,
  })
}

export async function reviewLeaveRequest(
  id: string,
  decision: "approved" | "rejected",
  notes?: string
): Promise<LeaveRequest> {
  return rpc<LeaveRequest>("review_leave_request", {
    p_request_id: id,
    p_decision: decision,
    p_notes: notes ?? null,
  })
}

// ---------------------------------------------------------------------------
// Correction requests
// ---------------------------------------------------------------------------

export async function cancelLeaveRequest(id: string): Promise<LeaveRequest> {
  return rpc<LeaveRequest>("cancel_leave_request", { p_request_id: id })
}

export async function getMyCorrections(): Promise<CorrectionRequest[]> {
  const supabase = getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data: emp } = await supabase.from("employees").select("id").eq("user_id", user.id).maybeSingle()
  if (!emp) return []
  return (await unwrap(
    supabase
      .from("attendance_correction_requests")
      .select("*")
      .eq("employee_id", (emp as { id: string }).id)
      .order("created_at", { ascending: false })
      .limit(100)
  )) as CorrectionRequest[]
}

export async function getCorrections(filters: {
  status?: CorrectionStatus | "all"
} = {}): Promise<CorrectionRequest[]> {
  const supabase = getClient()
  let query = supabase
    .from("attendance_correction_requests")
    .select(CORRECTION_SELECT)
    .order("created_at", { ascending: false })
    .limit(300)
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status)
  return (await unwrap(query)) as CorrectionRequest[]
}

export async function submitCorrectionRequest(input: {
  work_date: string
  proposed_check_in?: string | null
  proposed_check_out?: string | null
  reason: string
}): Promise<CorrectionRequest> {
  return rpc<CorrectionRequest>("submit_correction_request", {
    p_work_date: input.work_date,
    p_proposed_check_in: input.proposed_check_in ?? null,
    p_proposed_check_out: input.proposed_check_out ?? null,
    p_reason: input.reason,
  })
}

export async function reviewCorrectionRequest(
  id: string,
  decision: "approved" | "rejected",
  notes?: string
): Promise<CorrectionRequest> {
  return rpc<CorrectionRequest>("review_correction_request", {
    p_request_id: id,
    p_decision: decision,
    p_notes: notes ?? null,
  })
}

// ---------------------------------------------------------------------------
// Notifications & audit
// ---------------------------------------------------------------------------

export async function cancelCorrectionRequest(id: string): Promise<CorrectionRequest> {
  return rpc<CorrectionRequest>("cancel_correction_request", { p_request_id: id })
}

export async function getNotifications(limit = 50): Promise<AppNotification[]> {
  const supabase = getClient()
  return (await unwrap(
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
  )) as AppNotification[]
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = getClient()
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false)
  if (error) return 0
  return count ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = getClient()
  await unwrap(await supabase.from("notifications").update({ is_read: true }).eq("id", id).select("id"))
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = getClient()
  await unwrap(
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false).select("id")
  )
}

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  const supabase = getClient()
  return (await unwrap(
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit)
  )) as AuditLog[]
}

export async function getEmailOutbox(limit = 100): Promise<EmailOutboxItem[]> {
  const supabase = getClient()
  return (await unwrap(
    supabase
      .from("email_outbox")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
  )) as EmailOutboxItem[]
}

// ---------------------------------------------------------------------------
// Dashboard helpers
// ---------------------------------------------------------------------------

export async function getEmployeeCount(filters: { branchId?: string } = {}): Promise<number> {
  const supabase = getClient()
  let query = supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("employment_status", "active")
  if (filters.branchId) query = query.eq("branch_id", filters.branchId)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}
