// ============================================================================
// Pure attendance rules — client-side mirror of the DB classifier
// (compute_attendance_status / process_daily_cutoff in 021_workforce_functions.sql)
//
// Africa/Freetown runs UTC+0 all year, so wall-clock times in the schedule are
// treated as UTC instants. That keeps every calculation deterministic no matter
// which timezone the browser happens to be in.
// ============================================================================

import type {
  AttendanceSource,
  AttendanceStatus,
  CutoffStatus,
  OrgSettings,
  Weekday,
  WorkSchedule,
} from "@/types"

export const TIMEZONE = "Africa/Freetown"
export const DEFAULT_CUTOFF = "08:45"
export const DEFAULT_GRACE_MINUTES = 10

// ---------------------------------------------------------------------------
// Time primitives
// ---------------------------------------------------------------------------

/** yyyy-mm-dd for "now" in Africa/Freetown (UTC+0 => same as the UTC date). */
export function freeTownDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** "2026-10-19" + "08:45" => the instant of 08:45 UTC on that date. */
export function wallTimeToInstant(workDate: string, time: string): Date {
  return new Date(`${workDate}T${normalizeTime(time)}:00Z`)
}

function normalizeTime(time: string): string {
  const [h = "0", m = "0"] = time.split(":")
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`
}

/** "08:45" -> 525 (minutes since midnight). */
export function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = normalizeTime(time).split(":").map(Number)
  return h * 60 + m
}

/** Minutes since midnight -> "HH:MM". */
export function minutesToTime(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(total)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Scheduled start/end instants for a work date (night shifts cross midnight). */
export function scheduledWindow(
  workDate: string,
  schedule: Pick<WorkSchedule, "start_time" | "end_time">
): { start: Date; end: Date } {
  const start = wallTimeToInstant(workDate, schedule.start_time)
  const endCandidate = wallTimeToInstant(workDate, schedule.end_time)
  const crossesMidnight = timeToMinutes(schedule.end_time) <= timeToMinutes(schedule.start_time)
  return {
    start,
    end: crossesMidnight ? new Date(endCandidate.getTime() + 24 * 60 * 60 * 1000) : endCandidate,
  }
}

/** The 08:45 snapshot moment for a work date. */
export function cutoffMoment(workDate: string, cutoffTime: string = DEFAULT_CUTOFF): Date {
  return wallTimeToInstant(workDate, cutoffTime)
}

/** ISO weekday (1 = Mon .. 7 = Sun) of a yyyy-mm-dd date. */
export function isoWeekday(workDate: string): Weekday {
  const day = new Date(`${workDate}T00:00:00Z`).getUTCDay()
  return (day === 0 ? 7 : day) as Weekday
}

export function isWorkday(
  workDate: string,
  schedule: Pick<WorkSchedule, "work_days">
): boolean {
  return schedule.work_days.includes(isoWeekday(workDate))
}

export function isCutoffReached(now: Date, workDate: string, cutoffTime: string = DEFAULT_CUTOFF): boolean {
  return now.getTime() >= cutoffMoment(workDate, cutoffTime).getTime()
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface Classification {
  status: AttendanceStatus
  cutoffStatus: CutoffStatus | null
  minutesLate: number
}

export interface ClassifyOptions {
  schedule: Pick<WorkSchedule, "work_days" | "start_time" | "end_time" | "grace_minutes">
  workDate: string
  checkIn?: Date | null
  now?: Date
  cutoffTime?: string
}

/**
 * Mirror of public.compute_attendance_status().
 * Before the cutoff moment a missing check-in yields cutoffStatus = null —
 * nobody may be labelled "absent at 08:45" before 08:45 has happened.
 */
export function classify({
  schedule,
  workDate,
  checkIn = null,
  now = new Date(),
  cutoffTime = DEFAULT_CUTOFF,
}: ClassifyOptions): Classification {
  if (!isWorkday(workDate, schedule)) {
    return { status: "rest_day", cutoffStatus: "rest_day", minutesLate: 0 }
  }

  const { start } = scheduledWindow(workDate, schedule)
  const cutoff = cutoffMoment(workDate, cutoffTime)
  const graceMs = schedule.grace_minutes * 60 * 1000
  const graceDeadline = start.getTime() + graceMs

  if (checkIn) {
    const late = checkIn.getTime() > graceDeadline
    const status: AttendanceStatus = late ? "late" : "present"
    let cutoffStatus: CutoffStatus
    if (checkIn.getTime() <= cutoff.getTime()) {
      cutoffStatus = status
    } else if (graceDeadline < cutoff.getTime()) {
      cutoffStatus = "absent"
    } else {
      cutoffStatus = "pending"
    }
    return {
      status,
      cutoffStatus,
      minutesLate: Math.max(0, Math.round((checkIn.getTime() - start.getTime()) / 60000)),
    }
  }

  const status: AttendanceStatus = graceDeadline < now.getTime() ? "absent" : "pending"
  let cutoffStatus: CutoffStatus | null
  if (now.getTime() < cutoff.getTime()) {
    cutoffStatus = null
  } else if (graceDeadline < cutoff.getTime()) {
    cutoffStatus = "absent"
  } else {
    cutoffStatus = "pending"
  }
  return { status, cutoffStatus, minutesLate: 0 }
}

/** What the employee should be able to do right now. */
export type CheckAction = "check_in" | "check_out" | "done" | "off_duty"

export function nextAction(
  record: { check_in: string | null; check_out: string | null } | null | undefined,
  now: Date = new Date()
): CheckAction {
  if (!record?.check_in) return "check_in"
  if (!record.check_out) return "check_out"
  void now
  return "done"
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  pending: "Pending",
  present: "Present",
  late: "Late",
  absent: "Absent",
  on_leave: "On Leave",
  rest_day: "Rest Day",
  holiday: "Holiday",
  official_duty: "Official Duty",
}

export const SOURCE_LABELS: Record<AttendanceSource, string> = {
  self: "Self check-in",
  manager: "Manager entry",
  kiosk: "Kiosk",
  hr: "HR entry",
  system: "System",
}

export const SOURCE_STYLES: Record<AttendanceSource, string> = {
  self: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  kiosk: "bg-purple-500/10 text-purple-700 border-purple-500/20",
  manager: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  hr: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  system: "bg-zinc-500/10 text-zinc-600 border-zinc-500/20",
}

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Annual Leave",
  sick: "Sick Leave",
  unpaid: "Unpaid Leave",
  compassionate: "Compassionate Leave",
  maternity: "Maternity Leave",
  paternity: "Paternity Leave",
  study: "Study Leave",
  official_duty: "Official Duty",
  other: "Other",
}

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  pending: "bg-slate-100 text-slate-600 border-slate-200",
  present: "bg-emerald-100 text-emerald-700 border-emerald-200",
  late: "bg-amber-100 text-amber-700 border-amber-200",
  absent: "bg-red-100 text-red-700 border-red-200",
  on_leave: "bg-sky-100 text-sky-700 border-sky-200",
  rest_day: "bg-zinc-100 text-zinc-500 border-zinc-200",
  holiday: "bg-purple-100 text-purple-700 border-purple-200",
  official_duty: "bg-indigo-100 text-indigo-700 border-indigo-200",
}

const STATUS_DOTS: Record<AttendanceStatus, string> = {
  pending: "bg-slate-400",
  present: "bg-emerald-500",
  late: "bg-amber-500",
  absent: "bg-red-500",
  on_leave: "bg-sky-500",
  rest_day: "bg-zinc-400",
  holiday: "bg-purple-500",
  official_duty: "bg-indigo-500",
}

export function statusStyles(status: AttendanceStatus): string {
  return STATUS_STYLES[status] ?? STATUS_STYLES.pending
}

export function statusDot(status: AttendanceStatus): string {
  return STATUS_DOTS[status] ?? STATUS_DOTS.pending
}

/** Cutoff column: the frozen 08:45 view. */
export function cutoffStyles(cutoff: CutoffStatus | null): string {
  if (cutoff === null) return "bg-slate-50 text-slate-400 border-slate-200"
  return statusStyles(cutoff)
}

export function cutoffLabel(cutoff: CutoffStatus | null): string {
  if (cutoff === null) return "Not yet"
  if (cutoff === "pending") return "Not due"
  if (cutoff === "absent") return "Absent @ cutoff"
  if (cutoff === "present") return "Present @ cutoff"
  if (cutoff === "late") return "Late @ cutoff"
  return STATUS_LABELS[cutoff]
}

export function formatMinutesLate(minutes: number): string {
  if (minutes <= 0) return "0 min"
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** "08:45" / "2026-10-19T08:45:00Z" -> "08:45" local display (UTC == Freetown). */
export function formatClock(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const iso = typeof value === "string" ? value : value.toISOString()
  const match = iso.match(/T(\d{2}:\d{2})/)
  return match ? match[1] : "—"
}

/** Remaining time to the cutoff, humanised for the HR banner. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "passed"
  const totalMinutes = Math.ceil(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export function formatWorkDays(workDays: Weekday[]): string {
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  if (workDays.length === 7) return "Every day"
  const sorted = [...workDays].sort((a, b) => a - b)
  const weekdays = [1, 2, 3, 4, 5]
  if (JSON.stringify(sorted) === JSON.stringify(weekdays)) return "Mon – Fri"
  return sorted.map((d) => names[d]).join(", ")
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

export function cutoffTimeOf(settings?: Pick<OrgSettings, "hr_cutoff_time"> | null): string {
  return settings?.hr_cutoff_time ?? DEFAULT_CUTOFF
}

export function graceMinutesOf(
  schedule?: Pick<WorkSchedule, "grace_minutes"> | null,
  settings?: Pick<OrgSettings, "default_grace_minutes"> | null
): number {
  return schedule?.grace_minutes ?? settings?.default_grace_minutes ?? DEFAULT_GRACE_MINUTES
}
