import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { EmploymentStatus, UserRole, WorkSchedule, Weekday } from "@/types"
import type { EmployeeRank, EmploymentCategory } from "@/types"
import { formatWorkDays } from "@/lib/attendance"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function formatDateShort(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

export function formatDateTime(date: string | Date): string {
  return `${formatDate(date)} at ${formatTime(date)}`
}

export function getRelativeDate(date: string | Date): string {
  const d = new Date(date)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 0) {
    const abs = Math.abs(diffDays)
    if (abs === 1) return "Tomorrow"
    if (abs < 7) return `In ${abs} days`
    return formatDate(d)
  }
  if (diffDays < 7) return `${diffDays} days ago`
  return formatDate(d)
}

export function getToday(): string {
  return new Date().toISOString().split("T")[0]
}

export function getDayOfWeek(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", { weekday: "long" })
}

export function getGreeting(date: Date = new Date()): string {
  const hours = date.getHours()
  if (hours < 12) return "Good morning"
  if (hours < 17) return "Good afternoon"
  return "Good evening"
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

const roleStyleMap: Record<UserRole, { avatar: string; ring: string; badge: string; label: string }> = {
  super_admin: {
    avatar: "bg-purple-500/10 text-purple-600",
    ring: "ring-purple-500/30",
    badge: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    label: "text-purple-600",
  },
  hr_admin: {
    avatar: "bg-primary/15 text-primary",
    ring: "ring-primary/30",
    badge: "bg-primary/10 text-primary border-primary/20",
    label: "text-primary",
  },
  hr_officer: {
    avatar: "bg-blue-500/10 text-blue-600",
    ring: "ring-blue-500/30",
    badge: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    label: "text-blue-600",
  },
  branch_manager: {
    avatar: "bg-teal-500/10 text-teal-600",
    ring: "ring-teal-500/30",
    badge: "bg-teal-500/10 text-teal-600 border-teal-500/20",
    label: "text-teal-600",
  },
  employee: {
    avatar: "bg-slate-500/10 text-slate-600",
    ring: "ring-slate-500/30",
    badge: "bg-slate-500/10 text-slate-600 border-slate-500/20",
    label: "text-slate-600",
  },
}

export function getRoleStyles(role: UserRole): { avatar: string; ring: string; badge: string; label: string } {
  return roleStyleMap[role]
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "super_admin":
      return "Super Admin"
    case "hr_admin":
      return "HR Admin"
    case "hr_officer":
      return "HR Officer"
    case "branch_manager":
      return "Branch Manager"
    case "employee":
      return "Employee"
  }
}

// ---------------------------------------------------------------------------
// Employment status
// ---------------------------------------------------------------------------

const employmentLabelMap: Record<EmploymentStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  on_leave: "On Leave",
  terminated: "Terminated",
}

export function getEmploymentStatusLabel(status: EmploymentStatus): string {
  return employmentLabelMap[status]
}

export function getEmploymentStatusStyles(status: EmploymentStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
    case "inactive":
      return "bg-slate-500/10 text-slate-500 border-slate-500/20"
    case "on_leave":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20"
    case "terminated":
      return "bg-red-500/10 text-red-600 border-red-500/20"
  }
}

// ---------------------------------------------------------------------------
// Schedules & durations
// ---------------------------------------------------------------------------

export function formatWorkTime(schedule: Pick<WorkSchedule, "start_time" | "end_time">): string {
  const start = schedule.start_time?.slice(0, 5) ?? ""
  const end = schedule.end_time?.slice(0, 5) ?? ""
  return end ? `${start} – ${end}` : start
}

export function formatScheduleSummary(schedule?: WorkSchedule | null): string {
  if (!schedule) return "Schedule TBD"
  const days = formatWorkDays(schedule.work_days as Weekday[])
  const time = formatWorkTime(schedule)
  if (!days && !time) return "Schedule TBD"
  if (!time) return days
  if (!days) return time
  return `${days} · ${time}`
}

/** Duration between two instants ("1h 30m"); falls back to now when no end. */
export function getSessionDuration(start: string | Date, end?: string | Date | null): string {
  const startTime = new Date(start).getTime()
  const endTime = end ? new Date(end).getTime() : Date.now()
  const diffMs = endTime - startTime
  if (diffMs < 0) return "0m"
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function getInitials(name: string | null | undefined): string {
  return (name ?? "")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

// ---------------------------------------------------------------------------
// Corporate rank & employment category
// ---------------------------------------------------------------------------

const rankLabelMap: Record<EmployeeRank, string> = {
  ceo: "CEO",
  director: "Director",
  senior_manager: "Senior Manager",
  manager: "Manager",
  staff: "Staff",
  temporary_staff: "Temporary Staff",
  intern: "Intern",
}

export function getRankLabel(rank: EmployeeRank): string {
  return rankLabelMap[rank] ?? "Staff"
}

const rankStyleMap: Record<EmployeeRank, string> = {
  ceo: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  director: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  senior_manager: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  manager: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  staff: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  temporary_staff: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  intern: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
}

export function getRankStyles(rank: EmployeeRank): string {
  return rankStyleMap[rank] ?? rankStyleMap.staff
}

const categoryLabelMap: Record<EmploymentCategory, string> = {
  permanent: "Permanent",
  temporary: "Temporary (XL)",
  intern: "Intern",
}

export function getEmploymentCategoryLabel(category: EmploymentCategory): string {
  return categoryLabelMap[category] ?? "Permanent"
}

export function getEmploymentCategoryStyles(category: EmploymentCategory): string {
  switch (category) {
    case "permanent":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
    case "temporary":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20"
    case "intern":
      return "bg-sky-500/10 text-sky-600 border-sky-500/20"
  }
}

export function getAttendanceRate(present: number, total: number): number {
  if (total === 0) return 0
  return Math.round((present / total) * 100)
}
