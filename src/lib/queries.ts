"use client"

import { useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { QueryKey } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/providers/auth-provider"
import { freeTownDate } from "@/lib/attendance"
import * as db from "@/lib/db"
import type {
  AttendanceStatus,
  CorrectionStatus,
  EmploymentStatus,
  LeaveStatus,
  LeaveType,
  UserRole,
} from "@/types"

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const qk = {
  orgSettings: ["org-settings"] as const,
  branches: (activeOnly?: boolean) => ["branches", { activeOnly: !!activeOnly }] as const,
  departments: (branchId?: string) => ["departments", branchId ?? "all"] as const,
  teams: (departmentId?: string) => ["teams", departmentId ?? "all"] as const,
  schedules: (activeOnly?: boolean) => ["schedules", { activeOnly: !!activeOnly }] as const,
  holidays: (year?: number) => ["holidays", year ?? "all"] as const,
  employees: (filters?: db.EmployeeFilters) => ["employees", filters ?? {}] as const,
  employee: (id: string) => ["employee", id] as const,
  myEmployee: ["my-employee"] as const,
  myAttendance: (filters?: object) => ["my-attendance", filters ?? {}] as const,
  todayRecord: ["today-record"] as const,
  attendance: (filters?: db.AttendanceFilters) => ["attendance", filters ?? {}] as const,
  dailyReport: (date: string) => ["daily-report", date] as const,
  dailyReports: (limit: number) => ["daily-reports", limit] as const,
  myLeave: ["my-leave"] as const,
  leave: (filters?: object) => ["leave", filters ?? {}] as const,
  myCorrections: ["my-corrections"] as const,
  corrections: (filters?: object) => ["corrections", filters ?? {}] as const,
  notifications: (limit: number) => ["notifications", limit] as const,
  unreadNotifications: ["notifications-unread"] as const,
  auditLogs: (limit: number) => ["audit-logs", limit] as const,
  emailOutbox: (limit: number) => ["email-outbox", limit] as const,
  employeeCount: (branchId?: string) => ["employee-count", branchId ?? "all"] as const,
}

// ---------------------------------------------------------------------------
// Realtime invalidation helper
// ---------------------------------------------------------------------------

export function useRealtimeInvalidate(
  tables: string[],
  queryKeys: QueryKey[],
  channelName: string
) {
  const queryClient = useQueryClient()
  const tablesKey = JSON.stringify(tables)
  const keysKey = JSON.stringify(queryKeys)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(channelName)
    const parsedTables = JSON.parse(tablesKey) as string[]
    const parsedKeys = JSON.parse(keysKey) as QueryKey[]
    for (const table of parsedTables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const key of parsedKeys) {
          queryClient.invalidateQueries({ queryKey: key })
        }
      })
    }
    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelName, tablesKey, keysKey, queryClient])
}

// ---------------------------------------------------------------------------
// Org settings & directories
// ---------------------------------------------------------------------------

export function useOrgSettings() {
  return useQuery({
    queryKey: qk.orgSettings,
    queryFn: () => db.getOrgSettings(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateOrgSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: Parameters<typeof db.updateOrgSettings>[0]) => db.updateOrgSettings(patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.orgSettings })
      queryClient.invalidateQueries({ queryKey: ["my-employee"] })
    },
  })
}

export function useBranches(activeOnly = false) {
  return useQuery({
    queryKey: qk.branches(activeOnly),
    queryFn: () => db.getBranches({ activeOnly }),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateBranch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof db.createBranch>[0]) => db.createBranch(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branches"] }),
  })
}

export function useUpdateBranch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof db.updateBranch>[1] }) =>
      db.updateBranch(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branches"] }),
  })
}

export function useDepartments(branchId?: string) {
  return useQuery({
    queryKey: qk.departments(branchId),
    queryFn: () => db.getDepartments(branchId),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof db.createDepartment>[0]) => db.createDepartment(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["departments"] }),
  })
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof db.updateDepartment>[1] }) =>
      db.updateDepartment(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["departments"] }),
  })
}

export function useTeams(departmentId?: string) {
  return useQuery({
    queryKey: qk.teams(departmentId),
    queryFn: () => db.getTeams(departmentId),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof db.createTeam>[0]) => db.createTeam(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  })
}

export function useUpdateTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof db.updateTeam>[1] }) =>
      db.updateTeam(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  })
}

export function useSchedules(activeOnly = false) {
  return useQuery({
    queryKey: qk.schedules(activeOnly),
    queryFn: () => db.getSchedules({ activeOnly }),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof db.createSchedule>[0]) => db.createSchedule(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedules"] }),
  })
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof db.updateSchedule>[1] }) =>
      db.updateSchedule(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedules"] }),
  })
}

export function useHolidays(year?: number) {
  return useQuery({
    queryKey: qk.holidays(year),
    queryFn: () => db.getHolidays(year),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateHoliday() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof db.createHoliday>[0]) => db.createHoliday(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["holidays"] }),
  })
}

export function useDeleteHoliday() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => db.deleteHoliday(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["holidays"] }),
  })
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export function useEmployees(filters: db.EmployeeFilters = {}) {
  return useQuery({
    queryKey: qk.employees(filters),
    queryFn: () => db.getEmployees(filters),
  })
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: qk.employee(id ?? ""),
    queryFn: () => db.getEmployeeById(id as string),
    enabled: !!id,
  })
}

export function useMyEmployee() {
  const { user } = useAuth()
  return useQuery({
    queryKey: qk.myEmployee,
    queryFn: () => db.getMyEmployee(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: db.CreateEmployeePayload) => db.createEmployee(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees"] }),
  })
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof db.updateEmployee>[1] }) =>
      db.updateEmployee(id, patch),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] })
      queryClient.invalidateQueries({ queryKey: qk.employee(variables.id) })
      queryClient.invalidateQueries({ queryKey: ["my-employee"] })
    },
  })
}

export function useEmployeeAdminAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: db.EmployeeAdminAction) => db.employeeAdminAction(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] })
      queryClient.invalidateQueries({ queryKey: ["employee"] })
    },
  })
}

// ---------------------------------------------------------------------------
// Attendance — self service
// ---------------------------------------------------------------------------

export function useMyAttendance(filters: {
  from?: string
  to?: string
  status?: AttendanceStatus | "all"
  limit?: number
} = {}) {
  return useQuery({
    queryKey: qk.myAttendance(filters),
    queryFn: () => db.getMyAttendance(filters),
    refetchInterval: 60 * 1000,
  })
}

export function useTodayRecord() {
  const { user } = useAuth()
  return useQuery({
    queryKey: qk.todayRecord,
    queryFn: () => db.getMyTodayRecord(user!.id),
    enabled: !!user,
    refetchInterval: 60 * 1000,
  })
}

function notifyAttendanceEvent(event: "check_in" | "check_out", workDate: string) {
  void fetch("/api/attendance/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, work_date: workDate }),
  }).catch(() => {
    // Email delivery has a cron fallback; never block the attendance action.
  })
}

export function useCheckIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ latitude, longitude }: { latitude?: number; longitude?: number } = {}) =>
      db.checkIn(latitude, longitude),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: qk.todayRecord })
      queryClient.invalidateQueries({ queryKey: ["my-attendance"] })
      notifyAttendanceEvent("check_in", result.work_date)
    },
  })
}

export function useCheckOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => db.checkOut(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: qk.todayRecord })
      queryClient.invalidateQueries({ queryKey: ["my-attendance"] })
      notifyAttendanceEvent("check_out", result.work_date)
    },
  })
}

// ---------------------------------------------------------------------------
// Attendance — HR / manager
// ---------------------------------------------------------------------------

export function useAttendance(filters: db.AttendanceFilters = {}) {
  return useQuery({
    queryKey: qk.attendance(filters),
    queryFn: () => db.getAttendance(filters),
  })
}

/** On-demand full export. Pages past the 500-row cap of the on-screen table. */
export function useAttendanceExport() {
  return useMutation({
    mutationFn: (filters: db.AttendanceFilters) => db.getAttendanceForExport(filters),
  })
}

export function useHrRecordAttendance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof db.hrRecordAttendance>[0]) => db.hrRecordAttendance(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["daily-reports"] })
      queryClient.invalidateQueries({ queryKey: ["daily-report"] })
      queryClient.invalidateQueries({ queryKey: qk.todayRecord })
    },
  })
}

export function useDailyReport(date: string) {
  return useQuery({
    queryKey: qk.dailyReport(date),
    queryFn: () => db.getDailyReport(date),
  })
}

export function useDailyReports(limit = 30) {
  return useQuery({
    queryKey: qk.dailyReports(limit),
    queryFn: () => db.getDailyReports(limit),
  })
}

/**
 * Branch-scoped attendance history.
 *
 * `daily_attendance_reports` is readable by HR only, so a branch manager can
 * never load a cutoff snapshot from it. Attendance rows for the manager's own
 * branch are readable under the `attendance_select` policy, which lets us
 * rebuild the same snapshot client-side.
 */
export function useBranchAttendanceSeries(
  branchId: string | undefined,
  days: number,
  limit = 1000
) {
  return useQuery({
    // The window is resolved when the query runs, not while rendering: the
    // range has to follow the current Freetown date even if the dashboard
    // stays mounted across midnight.
    queryKey: ["attendance", "branch-series", branchId ?? "all", days, limit] as const,
    queryFn: () => {
      const now = Date.now()
      const today = freeTownDate(new Date(now))
      const fromDate = freeTownDate(new Date(now - Math.max(days, 1) * 86_400_000))
      return db.getAttendance({ branchId, from: fromDate, to: today, limit })
    },
    enabled: !!branchId,
  })
}

function invalidateReports(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["daily-report"] })
  queryClient.invalidateQueries({ queryKey: ["daily-reports"] })
  queryClient.invalidateQueries({ queryKey: ["attendance"] })
}

export function useRegenerateReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (date: string) => db.regenerateDailyReport(date),
    onSuccess: () => invalidateReports(queryClient),
  })
}

export function useProcessCutoff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { date?: string; force?: boolean } = {}) =>
      db.processDailyCutoff(input.date, input.force ?? true),
    onSuccess: () => invalidateReports(queryClient),
  })
}

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

export function useMyLeave() {
  return useQuery({
    queryKey: qk.myLeave,
    queryFn: () => db.getMyLeaveRequests(),
    refetchInterval: 60 * 1000,
  })
}

export function useLeaveRequests(filters: { status?: LeaveStatus | "all"; branchId?: string } = {}) {
  return useQuery({
    queryKey: qk.leave(filters),
    queryFn: () => db.getLeaveRequests(filters),
    refetchInterval: 60 * 1000,
  })
}

export function useSubmitLeave() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof db.submitLeaveRequest>[0]) => db.submitLeaveRequest(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.myLeave })
      queryClient.invalidateQueries({ queryKey: ["leave"] })
    },
  })
}

export function useReviewLeave() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      decision,
      notes,
    }: {
      id: string
      decision: "approved" | "rejected"
      notes?: string
    }) => db.reviewLeaveRequest(id, decision, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.myLeave })
      queryClient.invalidateQueries({ queryKey: ["leave"] })
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["daily-report"] })
    },
  })
}

// ---------------------------------------------------------------------------
// Corrections
// ---------------------------------------------------------------------------

export function useCancelLeave() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => db.cancelLeaveRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-leave"] })
      queryClient.invalidateQueries({ queryKey: ["leave"] })
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      queryClient.invalidateQueries({ queryKey: qk.unreadNotifications })
    },
  })
}

export function useMyCorrections() {
  return useQuery({
    queryKey: qk.myCorrections,
    queryFn: () => db.getMyCorrections(),
    refetchInterval: 60 * 1000,
  })
}

export function useCorrections(filters: { status?: CorrectionStatus | "all" } = {}) {
  return useQuery({
    queryKey: qk.corrections(filters),
    queryFn: () => db.getCorrections(filters),
    refetchInterval: 60 * 1000,
  })
}

export function useCancelCorrection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => db.cancelCorrectionRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-corrections"] })
      queryClient.invalidateQueries({ queryKey: ["corrections"] })
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      queryClient.invalidateQueries({ queryKey: qk.unreadNotifications })
    },
  })
}

export function useSubmitCorrection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof db.submitCorrectionRequest>[0]) =>
      db.submitCorrectionRequest(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.myCorrections })
      queryClient.invalidateQueries({ queryKey: ["corrections"] })
    },
  })
}

export function useReviewCorrection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      decision,
      notes,
    }: {
      id: string
      decision: "approved" | "rejected"
      notes?: string
    }) => db.reviewCorrectionRequest(id, decision, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.myCorrections })
      queryClient.invalidateQueries({ queryKey: ["corrections"] })
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["daily-report"] })
      queryClient.invalidateQueries({ queryKey: qk.todayRecord })
    },
  })
}

// ---------------------------------------------------------------------------
// Notifications & audit
// ---------------------------------------------------------------------------

export function useNotifications(limit = 50) {
  return useQuery({
    queryKey: qk.notifications(limit),
    queryFn: () => db.getNotifications(limit),
    refetchInterval: 60 * 1000,
  })
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: qk.unreadNotifications,
    queryFn: () => db.getUnreadNotificationCount(),
    refetchInterval: 60 * 1000,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => db.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      queryClient.invalidateQueries({ queryKey: qk.unreadNotifications })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => db.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      queryClient.invalidateQueries({ queryKey: qk.unreadNotifications })
    },
  })
}

export function useAuditLogs(limit = 100) {
  return useQuery({
    queryKey: qk.auditLogs(limit),
    queryFn: () => db.getAuditLogs(limit),
  })
}

export function useEmailOutbox(limit = 100) {
  return useQuery({
    queryKey: qk.emailOutbox(limit),
    queryFn: () => db.getEmailOutbox(limit),
    refetchInterval: 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const { refreshSession } = useAuth()
  return useMutation({
    mutationFn: (patch: { full_name?: string; avatar_url?: string | null }) =>
      db.updateProfileSelf(patch),
    onSuccess: async () => {
      await refreshSession()
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
  })
}

export function useEmployeeCount(branchId?: string) {
  return useQuery({
    queryKey: qk.employeeCount(branchId),
    queryFn: () => db.getEmployeeCount({ branchId }),
    staleTime: 5 * 60 * 1000,
  })
}

export type { UserRole, LeaveType, LeaveStatus, EmploymentStatus }
