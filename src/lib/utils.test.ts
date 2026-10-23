import { describe, it, expect, vi, afterEach } from "vitest"
import {
  cn,
  formatDate,
  formatTime,
  getToday,
  getDayOfWeek,
  getGreeting,
  getRoleLabel,
  getRoleStyles,
  getRankLabel,
  getRankStyles,
  getEmploymentCategoryLabel,
  getEmploymentCategoryStyles,
  getEmploymentStatusLabel,
  getEmploymentStatusStyles,
  getSessionDuration,
  getInitials,
  getAttendanceRate,
  formatWorkTime,
  formatScheduleSummary,
  getRelativeDate,
} from "./utils"
import type { WorkSchedule } from "@/types"

afterEach(() => {
  vi.useRealTimers()
})

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b")
    expect(cn("a", false && "b")).toBe("a")
    expect(cn("px-2", "p-4")).toBe("p-4")
  })
})

describe("date formatting", () => {
  it("formats a date", () => {
    expect(formatDate("2026-01-15")).toBe("Jan 15, 2026")
  })

  it("formats time as 12-hour", () => {
    expect(formatTime("2026-01-15T09:05:00Z")).toMatch(/\d{1,2}:05/)
  })

  it("returns today's local date for getToday", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-17T12:00:00Z"))
    expect(getToday()).toBe("2026-09-17")
  })

  it("returns the weekday name", () => {
    expect(getDayOfWeek("2026-09-17")).toBe("Thursday")
  })
})

describe("getGreeting", () => {
  it("returns morning greeting before noon", () => {
    expect(getGreeting(new Date("2026-09-17T08:00:00"))).toBe("Good morning")
  })
  it("returns afternoon greeting", () => {
    expect(getGreeting(new Date("2026-09-17T14:00:00"))).toBe("Good afternoon")
  })
  it("returns evening greeting", () => {
    expect(getGreeting(new Date("2026-09-17T19:00:00"))).toBe("Good evening")
  })
})

describe("getRelativeDate", () => {
  it("returns Today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-17T12:00:00"))
    expect(getRelativeDate("2026-09-17T08:00:00")).toBe("Today")
  })
  it("returns Yesterday", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-17T12:00:00"))
    expect(getRelativeDate("2026-09-16T18:00:00")).toBe("Yesterday")
  })
  it("returns Tomorrow for future dates", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-17T12:00:00"))
    expect(getRelativeDate("2026-09-18T08:00:00")).toBe("Tomorrow")
  })
})

describe("getRoleLabel", () => {
  it("maps workforce roles to labels", () => {
    expect(getRoleLabel("super_admin")).toBe("Super Admin")
    expect(getRoleLabel("hr_admin")).toBe("HR Admin")
    expect(getRoleLabel("hr_officer")).toBe("HR Officer")
    expect(getRoleLabel("branch_manager")).toBe("Branch Manager")
    expect(getRoleLabel("employee")).toBe("Employee")
  })
})

describe("getRoleStyles", () => {
  it("returns style classes for every role", () => {
    for (const role of ["super_admin", "hr_admin", "hr_officer", "branch_manager", "employee"] as const) {
      const styles = getRoleStyles(role)
      expect(styles.avatar).toBeTruthy()
      expect(styles.ring).toContain("ring-")
      expect(styles.badge).toContain("border-")
      expect(styles.label).toBeTruthy()
    }
  })
})

describe("corporate rank & employment category", () => {
  it("labels the full hierarchy", () => {
    expect(getRankLabel("ceo")).toBe("CEO")
    expect(getRankLabel("director")).toBe("Director")
    expect(getRankLabel("senior_manager")).toBe("Senior Manager")
    expect(getRankLabel("manager")).toBe("Manager")
    expect(getRankLabel("staff")).toBe("Staff")
    expect(getRankLabel("temporary_staff")).toBe("Temporary Staff")
    expect(getRankLabel("intern")).toBe("Intern")
  })

  it("returns rank badge classes for every rank", () => {
    for (const rank of [
      "ceo",
      "director",
      "senior_manager",
      "manager",
      "staff",
      "temporary_staff",
      "intern",
    ] as const) {
      expect(getRankStyles(rank)).toContain("border-")
    }
  })

  it("labels employment categories", () => {
    expect(getEmploymentCategoryLabel("permanent")).toBe("Permanent")
    expect(getEmploymentCategoryLabel("temporary")).toBe("Temporary (XL)")
    expect(getEmploymentCategoryLabel("intern")).toBe("Intern")
  })

  it("returns category badge classes", () => {
    expect(getEmploymentCategoryStyles("permanent")).toContain("emerald")
    expect(getEmploymentCategoryStyles("temporary")).toContain("amber")
    expect(getEmploymentCategoryStyles("intern")).toContain("sky")
  })
})

describe("employment status", () => {
  it("labels every status", () => {
    expect(getEmploymentStatusLabel("active")).toBe("Active")
    expect(getEmploymentStatusLabel("inactive")).toBe("Inactive")
    expect(getEmploymentStatusLabel("on_leave")).toBe("On Leave")
    expect(getEmploymentStatusLabel("terminated")).toBe("Terminated")
  })

  it("returns badge classes", () => {
    expect(getEmploymentStatusStyles("active")).toContain("emerald")
    expect(getEmploymentStatusStyles("terminated")).toContain("red")
  })
})

describe("getSessionDuration", () => {
  it("formats hours and minutes", () => {
    expect(getSessionDuration("2026-09-17T09:00:00", "2026-09-17T10:30:00")).toBe("1h 30m")
  })
  it("formats minutes only", () => {
    expect(getSessionDuration("2026-09-17T09:00:00", "2026-09-17T09:15:00")).toBe("15m")
  })
  it("handles negative diff", () => {
    expect(getSessionDuration("2026-09-17T10:00:00", "2026-09-17T09:00:00")).toBe("0m")
  })
})

describe("getInitials", () => {
  it("produces up to two uppercase initials", () => {
    expect(getInitials("John Doe")).toBe("JD")
    expect(getInitials("alice")).toBe("A")
  })
})

describe("getAttendanceRate", () => {
  it("returns percentage", () => {
    expect(getAttendanceRate(4, 5)).toBe(80)
  })
  it("rounds", () => {
    expect(getAttendanceRate(2, 3)).toBe(67)
  })
  it("handles zero total", () => {
    expect(getAttendanceRate(3, 0)).toBe(0)
  })
})

describe("schedule helpers", () => {
  const schedule = {
    id: "s1",
    name: "Standard Day",
    work_days: [1, 2, 3, 4, 5],
    start_time: "08:00",
    end_time: "16:30",
    grace_minutes: 10,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  } as WorkSchedule

  it("formats the time window", () => {
    expect(formatWorkTime(schedule)).toBe("08:00 – 16:30")
    expect(formatWorkTime({ start_time: "08:00", end_time: "08:00" })).toBe("08:00 – 08:00")
  })

  it("formats the full summary", () => {
    expect(formatScheduleSummary(schedule)).toBe("Mon – Fri · 08:00 – 16:30")
    expect(
      formatScheduleSummary({ ...schedule, work_days: [6, 7] })
    ).toBe("Sat, Sun · 08:00 – 16:30")
    expect(
      formatScheduleSummary({ ...schedule, work_days: [] as never, start_time: "", end_time: "" })
    ).toBe("Schedule TBD")
  })
})
