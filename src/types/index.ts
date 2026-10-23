// ============================================================================
// Orange SL Workforce Attendance — domain types
// Mirrors supabase/migrations/020_workforce_schema.sql
// ============================================================================

// ---------------------------------------------------------------------------
// Roles & enums
// ---------------------------------------------------------------------------
export type UserRole = "super_admin" | "hr_admin" | "hr_officer" | "branch_manager" | "employee"

export type EmploymentStatus = "active" | "inactive" | "on_leave" | "terminated"

/**
 * Corporate rank, top -> bottom:
 *   CEO > Directors > Senior Managers > Managers > Staff > Temporary Staff
 * Interns sit outside the ladder (always non-permanent).
 */
export type EmployeeRank =
  | "ceo"
  | "director"
  | "senior_manager"
  | "manager"
  | "staff"
  | "temporary_staff"
  | "intern"

/** Permanent, temporary (XL-supplied) or intern. Derived from rank in the DB. */
export type EmploymentCategory = "permanent" | "temporary" | "intern"

export type AttendanceStatus =
  | "pending"
  | "present"
  | "late"
  | "absent"
  | "on_leave"
  | "rest_day"
  | "holiday"
  | "official_duty"

export type CutoffStatus = AttendanceStatus

export type AttendanceSource = "self" | "manager" | "kiosk" | "hr" | "system"

export type LeaveType =
  | "annual"
  | "sick"
  | "unpaid"
  | "compassionate"
  | "maternity"
  | "paternity"
  | "study"
  | "official_duty"
  | "other"

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled"

export type CorrectionStatus = "pending" | "approved" | "rejected"

/** ISO weekday: 1 = Monday .. 7 = Sunday */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------
export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  avatar_url: string | null
  must_change_password: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Legacy alias used by the auth provider (profile is the app user). */
export type User = Profile

// ---------------------------------------------------------------------------
// Org structure
// ---------------------------------------------------------------------------
export interface Organization {
  id: string
  name: string
  code: string | null
  timezone: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface OrgSettings {
  id: number
  organization_id: string | null
  org_name: string
  timezone: string
  /** Africa/Freetown wall time, e.g. "08:45" */
  hr_cutoff_time: string
  standard_start_time: string
  standard_end_time: string
  default_grace_minutes: number
  require_location: boolean
  updated_by: string | null
  updated_at: string
}

export interface Branch {
  id: string
  name: string
  code: string
  region: string | null
  address: string | null
  phone: string | null
  latitude: number | null
  longitude: number | null
  radius_meters: number
  require_location: boolean
  is_active: boolean
  manager_id: string | null
  created_at: string
  updated_at: string
  manager?: Employee | null
}

export interface Department {
  id: string
  branch_id: string
  name: string
  code: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  branch?: Branch
}

export interface Team {
  id: string
  department_id: string
  name: string
  lead_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  department?: Department
}

export interface WorkSchedule {
  id: string
  name: string
  code: string | null
  work_days: Weekday[]
  start_time: string
  end_time: string
  grace_minutes: number
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------
export interface Employee {
  id: string
  employee_no: string
  full_name: string
  work_email: string | null
  phone: string | null
  branch_id: string
  department_id: string | null
  team_id: string | null
  job_title: string | null
  employment_status: EmploymentStatus
  rank: EmployeeRank
  employment_category: EmploymentCategory
  /** External company that manages this worker (e.g. 'XL' for temp staff). */
  managed_by_company: string | null
  /** Lower number = more senior; seeded from rank, hand-tunable by HR. */
  seniority: number | null
  manager_id: string | null
  schedule_id: string
  user_id: string | null
  hire_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string

  branch?: Branch
  department?: Department | null
  team?: Team | null
  schedule?: WorkSchedule
  manager?: Employee | null
  profile?: Profile | null
}

/**
 * Returned once when HR creates an employee (or resets their password). Contains
 * the one-time temporary password the admin hands to the employee for their
 * first sign-in, where they are forced to set their own password.
 */
export interface IssuedEmployee extends Employee {
  tempPassword?: string
}

/** The signed-in user's own employee row plus everything needed by check-in. */
export interface MyEmployee {
  employee: Employee
  schedule: WorkSchedule
  settings: OrgSettings
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
export interface AttendanceRecord {
  id: string
  employee_id: string
  work_date: string
  branch_id: string | null
  department_id: string | null
  schedule_id: string | null
  scheduled_start: string | null
  check_in: string | null
  check_out: string | null
  status: AttendanceStatus
  /** Frozen 08:45 snapshot; null until the cutoff moment has passed. */
  cutoff_status: CutoffStatus | null
  cutoff_at: string | null
  minutes_late: number
  source: AttendanceSource
  checked_in_by: string | null
  latitude: number | null
  longitude: number | null
  within_branch: boolean | null
  notes: string | null
  updated_by: string | null
  updated_reason: string | null
  created_at: string
  updated_at: string

  employee?: Employee
  branch?: Branch | null
  schedule?: WorkSchedule | null
}

/**
 * Per-branch breakdown embedded in daily_attendance_reports.counts.
 * Key names must match the payload built by process_daily_cutoff() in
 * supabase/migrations/021_workforce_functions.sql — the SQL emits "scheduled",
 * never "total".
 */
export interface BranchReportCounts {
  branch_id: string
  name: string
  code: string
  /** Employees rostered at this branch on the report date. */
  scheduled: number
  present: number
  late: number
  absent_at_cutoff: number
  on_leave: number
  pending: number
  checked_in: number
  total_minutes_late: number
}

export interface ReportCounts {
  total_employees: number
  rows: number
  scheduled: number
  present: number
  late: number
  /** The headline number for the 08:45 cutoff report. */
  absent_at_cutoff: number
  absent_now: number
  on_leave: number
  holiday: number
  pending: number
  checked_in: number
  total_minutes_late: number
  /** Employees marked on official duty rather than expected to clock in. */
  official_duty: number
  /** Employees whose scheduled day is a rest day for that schedule. */
  rest_day: number
  /** Employees still checked in with no checkout recorded at cutoff. */
  missing_checkout: number
  /** ISO timestamp of the cutoff instant this snapshot was taken at. */
  cutoff_at: string | null
  by_branch: BranchReportCounts[]
}

export interface DailyAttendanceReport {
  id: string
  report_date: string
  cutoff_time: string
  generated_at: string
  generated_by: string | null
  counts: ReportCounts
  notes: string | null
  created_at: string
}

export interface DashboardStats {
  total_employees: number
  present: number
  late: number
  absent_at_cutoff: number
  absent_now: number
  on_leave: number
  pending: number
  checked_in: number
  report_generated: boolean
}

// ---------------------------------------------------------------------------
// Leave & corrections
// ---------------------------------------------------------------------------
export interface LeaveRequest {
  id: string
  employee_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  reason: string | null
  status: LeaveStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  created_at: string
  updated_at: string
  employee?: Employee
}

export interface Holiday {
  id: string
  name: string
  holiday_date: string
  branch_id: string | null
  created_by: string | null
  created_at: string
  branch?: Branch | null
}

export interface CorrectionRequest {
  id: string
  employee_id: string
  work_date: string
  proposed_check_in: string | null
  proposed_check_out: string | null
  reason: string
  status: CorrectionStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  applied_record_id: string | null
  created_at: string
  updated_at: string
  employee?: Employee
}

// ---------------------------------------------------------------------------
// Audit & notifications
// ---------------------------------------------------------------------------
export interface AuditLog {
  id: number
  actor_id: string | null
  actor_role: string | null
  action: string
  entity: string | null
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
}

export interface AppNotification {
  id: string
  user_id: string
  title: string
  body: string
  link: string | null
  is_read: boolean
  created_at: string
}

/** A queued/sent missed-clock-in alert email (public.email_outbox). */
export interface EmailOutboxItem {
  id: string
  to_email: string
  subject: string
  body_html: string
  body_text: string | null
  category: string
  reference: string | null
  status: "queued" | "sent" | "failed" | "skipped"
  attempts: number
  last_error: string | null
  sent_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// RPC result shapes
// ---------------------------------------------------------------------------
export interface CheckInResult {
  success: boolean
  work_date: string
  check_in: string
  status: AttendanceStatus
  cutoff_status: CutoffStatus | null
  minutes_late: number
}

export interface CheckOutResult {
  success: boolean
  work_date: string
  check_in: string
  check_out: string
}

export interface CutoffRunResult {
  success?: boolean
  skipped?: boolean
  report_date: string
  generated_at?: string
  is_new?: boolean
  reason?: string
  cutoff_at?: string
  counts?: ReportCounts
}

export type { LeaveRequest as Leave }
