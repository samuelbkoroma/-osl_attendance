"use client"

import React, { useMemo, useState } from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PageHeader } from "@/components/layout/page-header"
import {
  StatCard,
  StatusBadge,
  EmptyState,
  DonutChart,
  TrendChart,
  SectionHeading,
} from "@/components/dashboard"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  useAttendance,
  useEmployees,
  useMyEmployee,
  useLeaveRequests,
  useCorrections,
  useBranchAttendanceSeries,
  useRealtimeInvalidate,
} from "@/lib/queries"
import { freeTownDate, formatClock, formatMinutesLate } from "@/lib/attendance"
import { aggregateBranchCounts } from "@/lib/branch-report"
import { formatDate, getInitials, cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Clock3,
  UserX,
  CalendarOff,
  MapPin,
  History,
  RefreshCw,
  Search,
  ArrowRight,
  CalendarDays,
  Timer,
  CheckCircle2,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

type TeamFilter = "all" | "in" | "late" | "not_in" | "on_leave"

export default function ManagerDashboard() {
  const queryClient = useQueryClient()
  const today = freeTownDate()
  const [search, setSearch] = useState("")
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all")

  const myEmployee = useMyEmployee()
  const branchId = myEmployee.data?.employee.branch_id

  const employees = useEmployees({ branchId, limit: 400 })
  const attendance = useAttendance({ date: today, branchId })
  const pendingLeave = useLeaveRequests({ status: "pending", branchId })
  const pendingCorrections = useCorrections({ status: "pending" })
  const series = useBranchAttendanceSeries(branchId, 7)

  useRealtimeInvalidate(
    ["attendance_records", "daily_attendance_reports"],
    [["attendance"], ["daily-report"], ["daily-reports"]],
    "realtime-manager"
  )

  const branch = myEmployee.data?.employee.branch
  const schedule = myEmployee.data?.employee.schedule

  const rows = useMemo(() => attendance.data ?? [], [attendance.data])
  const staff = useMemo(() => employees.data ?? [], [employees.data])
  const recordByEmployee = useMemo(() => {
    const map = new Map<string, (typeof rows)[number]>()
    for (const r of rows) map.set(r.employee_id, r)
    return map
  }, [rows])

  const stats = useMemo(() => {
    let present = 0
    let late = 0
    let absentAtCutoff = 0
    let onLeave = 0
    for (const r of rows) {
      if (r.cutoff_status === "absent") absentAtCutoff += 1
      if (r.status === "present") present += 1
      if (r.status === "late") late += 1
      if (r.status === "on_leave") onLeave += 1
    }
    const activeTotal = staff.filter((e) => e.employment_status === "active").length
    const expected = Math.max(activeTotal - onLeave, 0)
    const checkedIn = present + late
    const rate = expected > 0 ? Math.round((checkedIn / expected) * 100) : 0
    return { present, late, absentAtCutoff, onLeave, checkedIn, total: activeTotal, rate }
  }, [rows, staff])

  const branchReport = useMemo(() => {
    const rows = series.data ?? []
    if (rows.length === 0 || !branchId) return null

    const latestDate = rows.reduce((max, r) => (r.work_date > max ? r.work_date : max), "")
    if (!latestDate) return null

    const counts = aggregateBranchCounts(
      rows.filter((r) => r.work_date === latestDate)
    )

    return {
      branch_id: branchId,
      name: branch?.name ?? "Your branch",
      code: branch?.code ?? "",
      ...counts,
    }
  }, [series.data, branchId, branch])

  const notCheckedIn = useMemo(
    () =>
      staff.filter((emp) => {
        if (emp.employment_status !== "active") return false
        const rec = recordByEmployee.get(emp.id)
        return !rec?.check_in && rec?.status !== "on_leave"
      }),
    [staff, recordByEmployee]
  )

  const visibleStaff = useMemo(() => {
    const q = search.trim().toLowerCase()
    return staff.filter((emp) => {
      const rec = recordByEmployee.get(emp.id)
      const status = rec?.status
      if (teamFilter === "in" && status !== "present") return false
      if (teamFilter === "late" && status !== "late") return false
      if (teamFilter === "on_leave" && status !== "on_leave") return false
      if (teamFilter === "not_in" && (rec?.check_in || status === "on_leave")) return false
      if (!q) return true
      return (
        emp.full_name.toLowerCase().includes(q) ||
        emp.employee_no.toLowerCase().includes(q) ||
        (emp.job_title ?? "").toLowerCase().includes(q)
      )
    })
  }, [staff, recordByEmployee, teamFilter, search])

  const branchTrend = useMemo(() => {
    const rows = series.data ?? []
    if (rows.length === 0) return []

    const byDate = new Map<string, typeof rows>()
    for (const r of rows) {
      const bucket = byDate.get(r.work_date)
      if (bucket) bucket.push(r)
      else byDate.set(r.work_date, [r])
    }

    return [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, dayRows]) => {
        const counts = aggregateBranchCounts(dayRows)
        const [, m, d] = date.split("-")
        return {
          label: `${d}/${m}`,
          value: counts.scheduled > 0 ? Math.round((counts.present / counts.scheduled) * 100) : 0,
        }
      })
  }, [series.data])

  const isLoading = myEmployee.isLoading || attendance.isLoading || employees.isLoading

  const filters: Array<{ value: TeamFilter; label: string; count: number }> = [
    { value: "all", label: "All", count: staff.length },
    { value: "in", label: "On time", count: stats.present },
    { value: "late", label: "Late", count: stats.late },
    { value: "not_in", label: "Not in", count: notCheckedIn.length },
    { value: "on_leave", label: "On leave", count: stats.onLeave },
  ]

  return (
    <DashboardLayout title="Branch Dashboard">
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          title={branch?.name ?? "Branch Dashboard"}
          description={`${formatDate(today)}${
            schedule
              ? ` · ${schedule.start_time.slice(0, 5)}–${schedule.end_time.slice(0, 5)}`
              : ""
          }`}
          icon={LayoutDashboard}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" asChild>
            <Link href="/manager/team">
              <Users className="mr-2 h-4 w-4" />
              View team
            </Link>
          </Button>
        </PageHeader>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : !branchId ? (
          <Card>
            <CardContent className="py-10">
              <EmptyState
                icon={Users}
                title="No branch assigned"
                description="Your account is not linked to a branch yet. Contact HR to be assigned."
              />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden border-primary/15">
              <div className="border-b border-border/60 bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                      Today&apos;s check-in
                    </p>
                    <p className="mt-1 text-2xl font-bold tracking-tight">
                      {stats.checkedIn}
                      <span className="text-base font-medium text-muted-foreground"> / {stats.total} in</span>
                    </p>
                    <p className="mt-1 text-[12.5px] text-muted-foreground">
                      {stats.total === 0
                        ? "No staff assigned to this branch."
                        : stats.rate === 100
                          ? "Everyone has checked in. Great day."
                          : `${notCheckedIn.length} team member${
                              notCheckedIn.length === 1 ? "" : "s"
                            } still to check in.`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-2xl font-bold tabular-nums text-primary">{stats.rate}%</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">checked in</p>
                    </div>
                  </div>
                </div>
                <Progress value={stats.rate} className="mt-4 h-2" indicatorClassName="bg-primary" />
              </div>
              <div className="grid grid-cols-2 divide-x divide-border/60 sm:grid-cols-4">
                {[
                  { label: "Present", value: stats.present, icon: CheckCircle2, tone: "text-emerald-600" },
                  { label: "Late", value: stats.late, icon: Clock3, tone: "text-amber-600" },
                  { label: "Not in", value: notCheckedIn.length, icon: UserX, tone: "text-red-600" },
                  { label: "On leave", value: stats.onLeave, icon: CalendarOff, tone: "text-blue-600" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5 p-3 sm:p-4">
                    <item.icon className={cn("h-4 w-4 shrink-0", item.tone)} />
                    <div>
                      <p className="text-lg font-bold leading-none tabular-nums">{item.value}</p>
                      <p className="mt-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        {item.label}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Staff in branch"
                value={stats.total}
                description="active employees"
                icon={Users}
                variant="info"
                href="/manager/team"
              />
              <StatCard
                title="Present"
                value={stats.present}
                description={`${stats.rate}% of the branch`}
                icon={UserCheck}
                variant="success"
              />
              <StatCard
                title="Late"
                value={stats.late}
                description="checked in after 08:00"
                icon={Clock3}
                variant="warning"
              />
              <StatCard
                title="Absent at 08:45"
                value={stats.absentAtCutoff}
                description={`${notCheckedIn.length} not checked in`}
                icon={UserX}
                variant="destructive"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <SectionHeading title="Today's split" description="Where your team stands" icon={Timer} />
                </CardHeader>
                <CardContent className="flex items-center justify-center pb-5">
                  <DonutChart
                    centerLabel="checked in"
                    centerValue={stats.checkedIn}
                    size={148}
                    thickness={20}
                    segments={[
                      { label: "Present", value: stats.present, color: "#16a34a" },
                      { label: "Late", value: stats.late, color: "#f59e0b" },
                      { label: "Absent", value: stats.absentAtCutoff, color: "#dc2626" },
                      { label: "On leave", value: stats.onLeave, color: "#2563eb" },
                    ]}
                  />
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <SectionHeading
                    title="Present — last 7 reports"
                    description="Daily totals for your branch"
                    icon={CalendarDays}
                  />
                </CardHeader>
                <CardContent>
                  <TrendChart points={branchTrend} color="#16a34a" />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="gap-3 pb-3">
                  <SectionHeading
                    title="Today's team status"
                    description="Search or filter to find someone quickly"
                    icon={Users}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name, number or role"
                        className="h-9 pl-8 text-[13px]"
                      />
                    </div>
                    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:pb-0">
                      {filters.map((f) => (
                        <button
                          key={f.value}
                          onClick={() => setTeamFilter(f.value)}
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                            teamFilter === f.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted-foreground hover:bg-accent"
                          )}
                        >
                          {f.label}
                          <span
                            className={cn(
                              "tabular-nums",
                              teamFilter === f.value ? "text-primary-foreground/75" : "text-muted-foreground/70"
                            )}
                          >
                            {f.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-0 pb-1">
                  {visibleStaff.length === 0 ? (
                    <EmptyState
                      icon={Users}
                      title={staff.length === 0 ? "No employees" : "No one matches"}
                      description={
                        staff.length === 0
                          ? "No staff are assigned to this branch yet."
                          : "Try another name or filter."
                      }
                      compact
                      action={
                        staff.length > 0 ? (
                          <Button variant="outline" size="sm" onClick={() => { setSearch(""); setTeamFilter("all") }}>
                            Clear filters
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <div className="max-h-[460px] overflow-y-auto">
                      {visibleStaff.map((emp) => {
                        const rec = recordByEmployee.get(emp.id)
                        return (
                          <div
                            key={emp.id}
                            className="flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-accent/30"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <Avatar className="h-8 w-8 ring-2 ring-primary/10">
                                <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                                  {getInitials(emp.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium leading-tight">{emp.full_name}</p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {emp.job_title ?? emp.employee_no}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <div className="hidden text-right sm:block">
                                <p className="text-[12px] font-medium tabular-nums">
                                  {rec?.check_in ? formatClock(rec.check_in) : "—"}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {rec && rec.minutes_late > 0 ? formatMinutesLate(rec.minutes_late) : "check-in"}
                                </p>
                              </div>
                              {rec ? (
                                <StatusBadge status={rec.status} />
                              ) : (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    emp.employment_status === "active"
                                      ? "bg-slate-500/10 text-slate-600"
                                      : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {emp.employment_status === "active" ? "Not in" : "Inactive"}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t px-4 py-2.5">
                    <span className="text-[11px] text-muted-foreground">
                      Showing {visibleStaff.length} of {staff.length}
                    </span>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" asChild>
                      <Link href="/manager/team">
                        Full team
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <SectionHeading
                      title="Not checked in"
                      description={notCheckedIn.length === 0 ? "All clear for today" : "Needs a nudge"}
                      icon={UserX}
                      action={<Badge variant="outline">{notCheckedIn.length}</Badge>}
                    />
                  </CardHeader>
                  <CardContent>
                    {notCheckedIn.length === 0 ? (
                      <p className="rounded-xl border border-dashed p-4 text-[12.5px] text-muted-foreground">
                        Everyone scheduled has checked in or is on leave.
                      </p>
                    ) : (
                      <div className="max-h-56 space-y-2 overflow-y-auto">
                        {notCheckedIn.map((emp) => (
                          <div key={emp.id} className="flex items-center justify-between gap-2 text-[13px]">
                            <div className="flex min-w-0 items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="bg-primary/10 text-[9px] font-semibold text-primary">
                                  {getInitials(emp.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate">{emp.full_name}</span>
                            </div>
                            <Badge variant="outline" className="shrink-0 bg-amber-500/10 text-amber-700">
                              Not in
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <SectionHeading title="Branch details" icon={MapPin} />
                  </CardHeader>
                  <CardContent className="space-y-2.5 text-[13px]">
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{branch?.address ?? "No address on file"}</span>
                    </div>
                    {[
                      ["Code", branch?.code ?? "—"],
                      ["Region", branch?.region ?? "—"],
                      [
                        "Geofence",
                        branch?.latitude !== null && branch?.latitude !== undefined
                          ? `${branch.radius_meters} m`
                          : "Not set",
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <SectionHeading title="Awaiting review" description="Decide on team requests" icon={CalendarOff} />
                  </CardHeader>
                  <CardContent className="space-y-2.5 text-[13px]">
                    <Link
                      href="/manager/leave"
                      className="flex items-center justify-between hover:text-primary transition-colors"
                    >
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <CalendarOff className="h-3.5 w-3.5" />
                        Leave requests
                      </span>
                      <Badge variant="outline">{pendingLeave.data?.length ?? 0}</Badge>
                    </Link>
                    <Link
                      href="/manager/corrections"
                      className="flex items-center justify-between hover:text-primary transition-colors"
                    >
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <History className="h-3.5 w-3.5" />
                        Corrections
                      </span>
                      <Badge variant="outline">{pendingCorrections.data?.length ?? 0}</Badge>
                    </Link>
                  </CardContent>
                </Card>

                {branchReport && (
                  <Card>
                    <CardHeader className="pb-3">
                      <SectionHeading title="Latest 08:45 snapshot" icon={Clock3} />
                    </CardHeader>
                    <CardContent className="space-y-2 text-[13px]">
                      {[
                        ["Scheduled", branchReport.scheduled, ""],
                        ["Present", branchReport.present, "text-emerald-600"],
                        ["Late", branchReport.late, "text-amber-600"],
                        ["Absent", branchReport.absent_at_cutoff, "text-red-600"],
                        ["On leave", branchReport.on_leave, "text-blue-600"],
                      ].map(([label, value, tone]) => (
                        <div key={String(label)} className="flex items-center justify-between">
                          <span className="text-muted-foreground">{label}</span>
                          <span className={cn("font-medium tabular-nums", String(tone))}>{value}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            <Card className="overflow-hidden">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                    <Clock3 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold">Clock in for yourself too</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      Managers also need to record their own attendance.
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/employee">
                    My attendance
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
