import { describe, it, expect } from "vitest"
import {
  classify,
  cutoffLabel,
  cutoffMoment,
  formatMinutesLate,
  formatRemaining,
  formatWorkDays,
  freeTownDate,
  graceMinutesOf,
  isCutoffReached,
  isWorkday,
  minutesToTime,
  nextAction,
  scheduledWindow,
  statusStyles,
  timeToMinutes,
} from "./attendance"
import type { WorkSchedule } from "@/types"

const std: Pick<WorkSchedule, "work_days" | "start_time" | "end_time" | "grace_minutes"> = {
  work_days: [1, 2, 3, 4, 5],
  start_time: "08:00",
  end_time: "17:00",
  grace_minutes: 10,
}

const cs: typeof std = { work_days: [1, 2, 3, 4, 5, 6], start_time: "09:00", end_time: "18:00", grace_minutes: 15 }

const night: typeof std = { work_days: [1, 2, 3, 4, 5], start_time: "22:00", end_time: "06:00", grace_minutes: 15 }

const MON = "2026-10-12" // a Monday
const SAT = "2026-10-17" // its Saturday

const at = (iso: string) => new Date(iso)

describe("time primitives", () => {
  it("treats Freetown wall time as UTC (UTC+0 all year)", () => {
    expect(freeTownDate(new Date(Date.UTC(2026, 9, 19, 23, 30)))).toBe("2026-10-19")
    expect(freeTownDate(new Date(Date.UTC(2026, 9, 20, 0, 30)))).toBe("2026-10-20")
  })

  it("converts wall times to instants", () => {
    expect(cutoffMoment(MON, "08:45").toISOString()).toBe("2026-10-12T08:45:00.000Z")
    expect(timeToMinutes("08:45")).toBe(525)
    expect(minutesToTime(525)).toBe("08:45")
    expect(minutesToTime(0)).toBe("00:00")
    expect(minutesToTime(1440)).toBe("24:00")
  })

  it("builds a window that crosses midnight for night shifts", () => {
    const { start, end } = scheduledWindow(MON, night)
    expect(start.toISOString()).toBe("2026-10-12T22:00:00.000Z")
    expect(end.toISOString()).toBe("2026-10-13T06:00:00.000Z")
  })

  it("builds a same-day window for normal shifts", () => {
    const { start, end } = scheduledWindow(MON, std)
    expect(start.toISOString()).toBe("2026-10-12T08:00:00.000Z")
    expect(end.toISOString()).toBe("2026-10-12T17:00:00.000Z")
  })

  it("knows work days", () => {
    expect(isWorkday(MON, std)).toBe(true)
    expect(isWorkday(SAT, std)).toBe(false)
    expect(isWorkday(SAT, cs)).toBe(true)
  })

  it("detects the cutoff moment inclusively", () => {
    expect(isCutoffReached(at("2026-10-12T08:44:59Z"), MON)).toBe(false)
    expect(isCutoffReached(at("2026-10-12T08:45:00Z"), MON)).toBe(true)
    expect(isCutoffReached(at("2026-10-12T09:00:00Z"), MON)).toBe(true)
  })
})

describe("classify — with a check-in", () => {
  it("on time => present, 0 minutes late", () => {
    const r = classify({ schedule: std, workDate: MON, checkIn: at("2026-10-12T07:55:00Z"), now: at("2026-10-12T07:55:00Z") })
    expect(r).toEqual({ status: "present", cutoffStatus: "present", minutesLate: 0 })
  })

  it("inside the grace period => present, minutes recorded", () => {
    const r = classify({ schedule: std, workDate: MON, checkIn: at("2026-10-12T08:05:00Z") })
    expect(r).toEqual({ status: "present", cutoffStatus: "present", minutesLate: 5 })
  })

  it("one second past grace => late", () => {
    const r = classify({ schedule: std, workDate: MON, checkIn: at("2026-10-12T08:10:01Z") })
    expect(r.status).toBe("late")
    expect(r.cutoffStatus).toBe("late")
    expect(r.minutesLate).toBe(10) // round(601s / 60)
  })

  it("arrives after the 08:45 cutoff => late now, absent at cutoff", () => {
    const r = classify({ schedule: std, workDate: MON, checkIn: at("2026-10-12T10:00:00Z"), now: at("2026-10-12T10:00:00Z") })
    expect(r.status).toBe("late")
    expect(r.cutoffStatus).toBe("absent")
    expect(r.minutesLate).toBe(120)
  })

  it("09:00 shift arriving 09:05 (after cutoff, but not due at 08:45) => present, cutoff pending", () => {
    const r = classify({ schedule: cs, workDate: MON, checkIn: at("2026-10-12T09:05:00Z"), now: at("2026-10-12T09:05:00Z") })
    expect(r.status).toBe("present")
    expect(r.cutoffStatus).toBe("pending")
  })

  it("night shift check-in within grace => present, cutoff not due yet", () => {
    // Monday's 08:45 snapshot happens ~13h before the night shift starts.
    const r = classify({ schedule: night, workDate: MON, checkIn: at("2026-10-12T22:10:00Z") })
    expect(r.status).toBe("present")
    expect(r.cutoffStatus).toBe("pending")
    expect(r.minutesLate).toBe(10)
  })
})

describe("classify — without a check-in", () => {
  it("before start+grace and before cutoff => pending, cutoff unknown (null)", () => {
    const r = classify({ schedule: std, workDate: MON, checkIn: null, now: at("2026-10-12T08:05:00Z") })
    expect(r.status).toBe("pending")
    expect(r.cutoffStatus).toBeNull()
  })

  it("after start+grace but before cutoff => absent now, cutoff still unknown", () => {
    const r = classify({ schedule: std, workDate: MON, checkIn: null, now: at("2026-10-12T08:30:00Z") })
    expect(r.status).toBe("absent")
    expect(r.cutoffStatus).toBeNull()
  })

  it("at/after cutoff, past grace => absent at cutoff", () => {
    const r = classify({ schedule: std, workDate: MON, checkIn: null, now: at("2026-10-12T08:45:00Z") })
    expect(r.status).toBe("absent")
    expect(r.cutoffStatus).toBe("absent")
  })

  it("09:00 shift at 08:45 => never absent at cutoff (pending instead)", () => {
    const r = classify({ schedule: cs, workDate: MON, checkIn: null, now: at("2026-10-12T08:45:00Z") })
    expect(r.status).toBe("pending") // grace (09:15) has not passed yet
    expect(r.cutoffStatus).toBe("pending") // not yet due at the snapshot
  })

  it("09:00 shift before its own grace deadline => pending, cutoff unknown", () => {
    const r = classify({ schedule: cs, workDate: MON, checkIn: null, now: at("2026-10-12T08:44:00Z") })
    expect(r.status).toBe("pending")
    expect(r.cutoffStatus).toBeNull()
  })

  it("09:00 shift well after its grace deadline => absent for the day, cutoff still pending", () => {
    const r = classify({ schedule: cs, workDate: MON, checkIn: null, now: at("2026-10-12T12:00:00Z") })
    expect(r.status).toBe("absent")
    expect(r.cutoffStatus).toBe("pending")
  })

  it("rest day => rest_day, no absence", () => {
    const r = classify({ schedule: std, workDate: SAT, checkIn: null, now: at("2026-10-17T12:00:00Z") })
    expect(r.status).toBe("rest_day")
    expect(r.cutoffStatus).toBe("rest_day")
  })
})

describe("display helpers", () => {
  it("formats late minutes", () => {
    expect(formatMinutesLate(0)).toBe("0 min")
    expect(formatMinutesLate(45)).toBe("45 min")
    expect(formatMinutesLate(60)).toBe("1 h")
    expect(formatMinutesLate(125)).toBe("2 h 5 min")
  })

  it("labels the cutoff column", () => {
    expect(cutoffLabel(null)).toBe("Not yet")
    expect(cutoffLabel("pending")).toBe("Not due")
    expect(cutoffLabel("absent")).toBe("Absent @ cutoff")
    expect(cutoffLabel("present")).toBe("Present @ cutoff")
    expect(cutoffLabel("late")).toBe("Late @ cutoff")
    expect(cutoffLabel("on_leave")).toBe("On Leave")
  })

  it("provides non-empty badge classes for every status", () => {
    for (const s of ["pending", "present", "late", "absent", "on_leave", "rest_day", "holiday", "official_duty"] as const) {
      expect(statusStyles(s).length).toBeGreaterThan(0)
    }
  })

  it("formats the cutoff countdown", () => {
    expect(formatRemaining(0)).toBe("passed")
    expect(formatRemaining(45 * 60000)).toBe("45 min")
    expect(formatRemaining(60 * 60000)).toBe("1 h")
    expect(formatRemaining(90 * 60000)).toBe("1 h 30 min")
  })

  it("summarises work days", () => {
    expect(formatWorkDays([1, 2, 3, 4, 5])).toBe("Mon – Fri")
    expect(formatWorkDays([7, 1, 2, 3, 4, 5, 6])).toBe("Every day")
    expect(formatWorkDays([1, 3, 5])).toBe("Mon, Wed, Fri")
  })

  it("derives grace from schedule, falling back to org settings", () => {
    expect(graceMinutesOf(std)).toBe(10)
    expect(graceMinutesOf(undefined, { default_grace_minutes: 15 })).toBe(15)
    expect(graceMinutesOf(undefined, undefined)).toBe(10)
  })

  it("suggests the next check-in action", () => {
    expect(nextAction(null)).toBe("check_in")
    expect(nextAction({ check_in: null, check_out: null })).toBe("check_in")
    expect(nextAction({ check_in: "2026-10-12T08:00:00Z", check_out: null })).toBe("check_out")
    expect(nextAction({ check_in: "2026-10-12T08:00:00Z", check_out: "2026-10-12T17:00:00Z" })).toBe("done")
  })
})
