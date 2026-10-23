import { describe, expect, it } from "vitest"
import {
  aggregateBranchCounts,
  attendanceRate,
  emptyBranchCounts,
  onTimeRate,
} from "./branch-report"

describe("aggregateBranchCounts", () => {
  it("returns zeroed counts for no rows", () => {
    expect(aggregateBranchCounts([])).toEqual(emptyBranchCounts())
  })

  it("counts each status the same way process_daily_cutoff does", () => {
    const rows = [
      { status: "present", cutoff_status: "present", check_in: "2026-10-21T08:00:00Z", minutes_late: 0 },
      { status: "late", cutoff_status: "late", check_in: "2026-10-21T08:20:00Z", minutes_late: 20 },
      { status: "absent", cutoff_status: "absent", check_in: null, minutes_late: 0 },
      { status: "on_leave", cutoff_status: null, check_in: null, minutes_late: 0 },
      { status: "official_duty", cutoff_status: null, check_in: null, minutes_late: 0 },
      { status: "pending", cutoff_status: null, check_in: null, minutes_late: 0 },
      { status: "rest_day", cutoff_status: null, check_in: null, minutes_late: 0 },
    ]

    const counts = aggregateBranchCounts(rows)

    // rest_day is not in the scheduled set
    expect(counts.scheduled).toBe(6)
    expect(counts.present).toBe(1)
    expect(counts.late).toBe(1)
    expect(counts.absent_at_cutoff).toBe(1)
    expect(counts.on_leave).toBe(1)
    expect(counts.pending).toBe(1)
    expect(counts.checked_in).toBe(2)
    expect(counts.total_minutes_late).toBe(20)
  })

  it("treats a missing check_in as not checked in", () => {
    const counts = aggregateBranchCounts([
      { status: "present", cutoff_status: "present", check_in: null, minutes_late: 0 },
    ])
    expect(counts.checked_in).toBe(0)
  })

  it("tolerates null status, cutoff_status and minutes_late", () => {
    const counts = aggregateBranchCounts([
      { status: null, cutoff_status: null, check_in: null, minutes_late: null },
    ])
    expect(counts.scheduled).toBe(0)
    expect(counts.total_minutes_late).toBe(0)
  })

  it("sums minutes late across rows", () => {
    const counts = aggregateBranchCounts([
      { status: "late", cutoff_status: "late", check_in: "x", minutes_late: 15 },
      { status: "late", cutoff_status: "late", check_in: "y", minutes_late: 7 },
      { status: "present", cutoff_status: "present", check_in: "z", minutes_late: 0 },
    ])
    expect(counts.total_minutes_late).toBe(22)
  })
})

describe("onTimeRate", () => {
  it("returns 0 when nobody was scheduled", () => {
    expect(onTimeRate({ present: 0, scheduled: 0 })).toBe(0)
  })

  it("computes present over scheduled", () => {
    expect(onTimeRate({ present: 8, scheduled: 10 })).toBe(80)
  })
})

describe("attendanceRate", () => {
  it("returns 0 when nobody was scheduled", () => {
    expect(attendanceRate({ present: 0, late: 0, scheduled: 0 })).toBe(0)
  })

  it("counts present and late as attending", () => {
    expect(attendanceRate({ present: 8, late: 2, scheduled: 10 })).toBe(100)
  })
})
