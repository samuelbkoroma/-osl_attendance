"use client"

import React, { useMemo, useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState, StatCard, StatusBadge } from "@/components/dashboard"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Callout } from "@/components/ui/callout"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  useAttendance,
  useEmployees,
  useMyEmployee,
  useRealtimeInvalidate,
} from "@/lib/queries"
import { freeTownDate, formatClock, formatMinutesLate, SOURCE_LABELS, SOURCE_STYLES } from "@/lib/attendance"
import { getInitials, getEmploymentStatusLabel, cn } from "@/lib/utils"
import {
  Users,
  Search,
  RefreshCw,
  UserCheck,
  Clock3,
  UserX,
  CalendarOff,
  Mail,
  Phone,
  Briefcase,
  Building2,
  Layers,
  MapPin,
  AlertTriangle,
  ExternalLink,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"

type TeamFilter = "all" | "on_time" | "late" | "not_in" | "on_leave" | "inactive"

const FILTERS: Array<{ value: TeamFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "on_time", label: "On time" },
  { value: "late", label: "Late" },
  { value: "not_in", label: "Not in" },
  { value: "on_leave", label: "On leave" },
  { value: "inactive", label: "Inactive" },
]

export default function ManagerTeamPage() {
  const queryClient = useQueryClient()
  const today = freeTownDate()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<TeamFilter>("all")

  const myEmployee = useMyEmployee()
  const branchId = myEmployee.data?.employee.branch_id
  const branch = myEmployee.data?.employee.branch

  const employees = useEmployees({ branchId, limit: 400 })
  const attendance = useAttendance({ date: today, branchId })

  useRealtimeInvalidate(
    ["attendance_records", "employees"],
    [["attendance"], ["employees"]],
    "realtime-manager-team"
  )

  const staff = useMemo(
    () => [...(employees.data ?? [])].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [employees.data]
  )
  const rows = useMemo(() => attendance.data ?? [], [attendance.data])
  const recordByEmployee = useMemo(() => {
    const map = new Map<string, (typeof rows)[number]>()
    for (const r of rows) map.set(r.employee_id, r)
    return map
  }, [rows])

  const counts = useMemo(() => {
    let present = 0
    let late = 0
    let onLeave = 0
    let notIn = 0
    let inactive = 0
    for (const emp of staff) {
      if (emp.employment_status !== "active") {
        inactive += 1
        continue
      }
      const rec = recordByEmployee.get(emp.id)
      if (rec?.status === "present") present += 1
      else if (rec?.status === "late") late += 1
      else if (rec?.status === "on_leave") onLeave += 1
      else notIn += 1
    }
    return { present, late, onLeave, notIn, inactive, total: staff.length }
  }, [staff, recordByEmployee])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return staff.filter((emp) => {
      const rec = recordByEmployee.get(emp.id)
      if (filter === "inactive" && emp.employment_status === "active") return false
      if (filter === "on_time" && rec?.status !== "present") return false
      if (filter === "late" && rec?.status !== "late") return false
      if (filter === "on_leave" && rec?.status !== "on_leave") return false
      if (filter === "not_in" && (emp.employment_status !== "active" || rec?.check_in || rec?.status === "on_leave"))
        return false
      if (!q) return true
      return (
        emp.full_name.toLowerCase().includes(q) ||
        emp.employee_no.toLowerCase().includes(q) ||
        (emp.job_title ?? "").toLowerCase().includes(q) ||
        (emp.department?.name ?? "").toLowerCase().includes(q) ||
        (emp.team?.name ?? "").toLowerCase().includes(q)
      )
    })
  }, [staff, recordByEmployee, filter, search])

  const filterCount = (value: TeamFilter) => {
    if (value === "all") return counts.total
    if (value === "on_time") return counts.present
    if (value === "late") return counts.late
    if (value === "not_in") return counts.notIn
    if (value === "on_leave") return counts.onLeave
    return counts.inactive
  }

  return (
    <DashboardLayout title="My Team">
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          title="My Team"
          description={branch ? `Everyone in ${branch.name}` : "Everyone in your branch"}
          icon={Users}
        >
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </PageHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Team size"
            value={counts.total}
            description={branch?.code ? `Branch ${branch.code}` : "active and inactive"}
            icon={Users}
            variant="info"
          />
          <StatCard
            title="On time"
            value={counts.present}
            description="checked in before 08:00"
            icon={UserCheck}
            variant="success"
          />
          <StatCard
            title="Late"
            value={counts.late}
            description="checked in after 08:00"
            icon={Clock3}
            variant="warning"
          />
          <StatCard
            title="Not in"
            value={counts.notIn}
            description={`${counts.onLeave} on leave today`}
            icon={UserX}
            variant="destructive"
          />
        </div>

        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, number, role, department or team"
                  className="h-9 pl-8 text-[13px]"
                />
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {staff.length}
              </p>
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors",
                    filter === f.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      "tabular-nums",
                      filter === f.value ? "text-primary-foreground/75" : "text-muted-foreground/70"
                    )}
                  >
                    {filterCount(f.value)}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {employees.isLoading || attendance.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : !branchId ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Building2}
                title="No branch assigned"
                description="Your account is not linked to a branch yet. Contact HR to be assigned."
              />
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Users}
                title={staff.length === 0 ? "No teammates yet" : "No one matches"}
                description={
                  staff.length === 0
                    ? "When HR assigns employees to your branch, they will appear here."
                    : "Try a different name or clear the filter."
                }
                action={
                  staff.length > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilter("all") }}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((emp) => {
              const rec = recordByEmployee.get(emp.id)
              const isActive = emp.employment_status === "active"
              return (
                <Card
                  key={emp.id}
                  className="overflow-hidden transition-shadow hover:shadow-[var(--elevation-2)]"
                >
                  <div className="h-1 w-full bg-gradient-to-r from-primary/60 to-primary/10" />
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar className="h-10 w-10 ring-2 ring-primary/10">
                          <AvatarImage src={emp.profile?.avatar_url ?? undefined} alt={emp.full_name} />
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                            {getInitials(emp.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold leading-tight">{emp.full_name}</p>
                          <p className="font-mono text-[10.5px] text-muted-foreground">{emp.employee_no}</p>
                        </div>
                      </div>
                      {rec ? (
                        <StatusBadge status={rec.status} />
                      ) : (
                        <Badge
                          variant="outline"
                          className={cn(
                            isActive ? "bg-slate-500/10 text-slate-600" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {isActive ? "Not in" : "Inactive"}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {emp.job_title && (
                        <Badge variant="outline" className="gap-1 font-normal">
                          <Briefcase className="h-3 w-3" />
                          {emp.job_title}
                        </Badge>
                      )}
                      {emp.department?.name && (
                        <Badge variant="outline" className="gap-1 font-normal">
                          <Building2 className="h-3 w-3" />
                          {emp.department.name}
                        </Badge>
                      )}
                      {emp.team?.name && (
                        <Badge variant="outline" className="gap-1 font-normal">
                          <Layers className="h-3 w-3" />
                          {emp.team.name}
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-2 text-center">
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">In</p>
                        <p className="mt-0.5 text-[11.5px] font-semibold tabular-nums">
                          {rec?.check_in ? formatClock(rec.check_in) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Out</p>
                        <p className="mt-0.5 text-[11.5px] font-semibold tabular-nums">
                          {rec?.check_out ? formatClock(rec.check_out) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Late</p>
                        <p
                          className={cn(
                            "mt-0.5 text-[11.5px] font-semibold tabular-nums",
                            rec && rec.minutes_late > 0 && "text-warning"
                          )}
                        >
                          {rec && rec.minutes_late > 0 ? formatMinutesLate(rec.minutes_late) : "—"}
                        </p>
                      </div>
                    </div>

                    {rec && (
                      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border bg-card/60 px-2.5 py-1.5 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] py-0 px-1.5", SOURCE_STYLES[rec.source] ?? "bg-slate-100 text-slate-700")}
                          >
                            {SOURCE_LABELS[rec.source] ?? rec.source}
                          </Badge>
                          {rec.within_branch === true ? (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20 text-[10px]">
                              <MapPin className="h-2.5 w-2.5 text-emerald-600" />
                              Inside
                            </span>
                          ) : rec.within_branch === false ? (
                            <span className="inline-flex items-center gap-1 font-medium text-rose-700 bg-rose-500/10 px-1.5 py-0.5 rounded-full border border-rose-500/20 text-[10px]">
                              <AlertTriangle className="h-2.5 w-2.5 text-rose-600" />
                              Outside
                            </span>
                          ) : null}
                        </div>
                        {rec.latitude !== null && rec.longitude !== null && (
                          <a
                            href={`https://www.google.com/maps?q=${rec.latitude},${rec.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-primary transition-colors"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            GPS
                          </a>
                        )}
                      </div>
                    )}

                    <div className="space-y-1 border-t pt-2.5 text-[11.5px] text-muted-foreground">
                      {emp.work_email && (
                        <p className="flex items-center gap-1.5 truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{emp.work_email}</span>
                        </p>
                      )}
                      {emp.phone && (
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 shrink-0" />
                          {emp.phone}
                        </p>
                      )}
                      {!isActive && (
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <CalendarOff className="h-3 w-3 shrink-0" />
                          {getEmploymentStatusLabel(emp.employment_status)}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        <Callout variant="tip" title="Keeping track of your team">
          Status updates live as employees clock in or out. Use the filters above to find anyone who is late or has not
          checked in, then follow up directly. Leave and correction requests are reviewed by HR.
        </Callout>
      </div>
    </DashboardLayout>
  )
}
