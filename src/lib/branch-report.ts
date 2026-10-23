import type { BranchReportCounts } from "@/types"

/**
 * Minimal shape of an attendance row needed to build a branch snapshot.
 * Kept structural so the helper works with the full AttendanceRecord type
 * and with plain test fixtures.
 */
export interface AttendanceSnapshotRow {
  status: string | null
  cutoff_status: string | null
  check_in: string | null
  minutes_late: number | null
}

/** Statuses that count towards "scheduled" — mirrors process_daily_cutoff(). */
const SCHEDULED_STATUSES = new Set([
  "present",
  "late",
  "absent",
  "pending",
  "on_leave",
  "official_duty",
])

export function emptyBranchCounts(): Omit<BranchReportCounts, "branch_id" | "name" | "code"> {
  return {
    scheduled: 0,
    present: 0,
    late: 0,
    absent_at_cutoff: 0,
    on_leave: 0,
    pending: 0,
    checked_in: 0,
    total_minutes_late: 0,
  }
}

/**
 * Aggregates attendance rows into per-branch cutoff counts.
 *
 * The rules are copied verbatim from process_daily_cutoff() in
 * supabase/migrations/021_workforce_functions.sql so that a branch manager
 * viewing their own branch sees exactly the numbers HR sees in the org-wide
 * cutoff report.
 */
export function aggregateBranchCounts(rows: AttendanceSnapshotRow[]): Omit<
  BranchReportCounts,
  "branch_id" | "name" | "code"
> {
  const counts = emptyBranchCounts()

  for (const row of rows) {
    const status = row.status ?? ""
    if (SCHEDULED_STATUSES.has(status)) counts.scheduled += 1
    if (status === "present") counts.present += 1
    if (status === "late") counts.late += 1
    if (row.cutoff_status === "absent") counts.absent_at_cutoff += 1
    if (status === "on_leave") counts.on_leave += 1
    if (status === "pending") counts.pending += 1
    if (row.check_in) counts.checked_in += 1
    if (row.minutes_late) counts.total_minutes_late += row.minutes_late
  }

  return counts
}

/** On-time percentage for a branch, guarding against a zero denominator. */
export function onTimeRate(counts: { present: number; scheduled: number }): number {
  if (counts.scheduled <= 0) return 0
  return Math.round((counts.present / counts.scheduled) * 100)
}

/** Attendance rate (present + late) as a percentage of those scheduled. */
export function attendanceRate(counts: { present: number; late: number; scheduled: number }): number {
  if (counts.scheduled <= 0) return 0
  return Math.round(((counts.present + counts.late) / counts.scheduled) * 100)
}
