"use client"

import React, { useState, useMemo } from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PageHeader } from "@/components/layout/page-header"
import {
  StatCard,
  EmptyState,
  DonutChart,
  BarList,
  TrendChart,
  SectionHeading,
  ActionTile,
  GuideCard,
} from "@/components/dashboard"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/providers/toast-provider"
import {
  useDailyReport,
  useDailyReports,
  useRegenerateReport,
  useProcessCutoff,
  useRealtimeInvalidate,
  useLeaveRequests,
  useCorrections,
} from "@/lib/queries"
import { freeTownDate, formatClock, STATUS_LABELS } from "@/lib/attendance"
import { formatDate, cn } from "@/lib/utils"
import {
  ClipboardList,
  Users,
  UserCheck,
  Clock3,
  UserX,
  CalendarOff,
  RefreshCw,
  PlayCircle,
  ArrowRight,
  Timer,
  CalendarCheck2,
  CalendarDays,
  FileClock,
  Settings2,
} from "lucide-react"
import { canManageSettings } from "@/lib/navigation"
import { useAuth } from "@/providers/auth-provider"

export default function HrDashboard() {
  const { user } = useAuth()
  const { error: toastError, success, warning } = useToast()
  const [date, setDate] = useState(() => freeTownDate())

  const report = useDailyReport(date)
  const recentReports = useDailyReports(7)
  const pendingLeave = useLeaveRequests({ status: "pending" })
  const pendingCorrections = useCorrections({ status: "pending" })
  const regenerate = useRegenerateReport()
  const processCutoff = useProcessCutoff()

  useRealtimeInvalidate(
    ["daily_attendance_reports", "attendance_records"],
    [["daily-report"], ["daily-reports"], ["attendance"]],
    "realtime-hr-report"
  )

  const counts = report.data?.counts
  const branchRows = useMemo(() => counts?.by_branch ?? [], [counts])

  const trend = useMemo(() => {
    const rows = (recentReports.data ?? [])
      .slice()
      .sort((a, b) => (a.report_date < b.report_date ? -1 : 1))
    return rows.map((r) => {
      const scheduled = r.counts?.scheduled ?? 0
      const present = r.counts?.present ?? 0
      const rate = scheduled > 0 ? Math.round((present / scheduled) * 100) : 0
      const [, m, d] = r.report_date.split("-")
      return { label: `${d}/${m}`, value: rate }
    })
  }, [recentReports.data])

  const branchBars = useMemo(
    () =>
      [...branchRows]
        .sort((a, b) => b.scheduled - a.scheduled)
        .slice(0, 8)
        .map((b) => ({ label: b.name, value: b.scheduled, color: "#ff7900" })),
    [branchRows]
  )

  const canForce = canManageSettings(user?.role) || user?.role === "super_admin"

  const rate = counts && counts.scheduled > 0 ? Math.round((counts.present / counts.scheduled) * 100) : 0
  const attendanceRate =
    counts && counts.scheduled > 0
      ? Math.round(((counts.present + counts.late) / counts.scheduled) * 100)
      : 0

  const runRegenerate = () => {
    regenerate.mutate(date, {
      onSuccess: (res) => {
        if (res.skipped) {
          warning("Report not generated", res.reason ?? "Cutoff has not been reached yet.")
        } else {
          success("Report regenerated", `Snapshot for ${formatDate(date)} is up to date.`)
        }
      },
      onError: (err) => toastError("Regeneration failed", err.message),
    })
  }

  const runCutoff = () => {
    processCutoff.mutate(
      { date, force: true },
      {
        onSuccess: (res) => {
          if (res.skipped) {
            warning("Skipped", res.reason ?? "Cutoff not reached.")
          } else {
            success("Cutoff processed", `Report generated for ${formatDate(date)}.`)
          }
        },
        onError: (err) => toastError("Cutoff failed", err.message),
      }
    )
  }

  const stats = useMemo(() => {
    if (!counts) return []
    return [
      {
        title: "Total employees",
        value: counts.total_employees,
        icon: Users,
        variant: "info" as const,
        description: "across all branches",
      },
      {
        title: "Scheduled",
        value: counts.scheduled,
        icon: ClipboardList,
        variant: "default" as const,
        description: "expected today",
      },
      {
        title: "Present",
        value: counts.present,
        icon: UserCheck,
        variant: "success" as const,
        description: `${rate}% on time`,
      },
      {
        title: "Late",
        value: counts.late,
        icon: Clock3,
        variant: "warning" as const,
        description: `${counts.total_minutes_late} min total`,
      },
      {
        title: "Absent at cutoff",
        value: counts.absent_at_cutoff,
        icon: UserX,
        variant: "destructive" as const,
        description: "08:45 snapshot",
      },
      {
        title: "On leave",
        value: counts.on_leave,
        icon: CalendarOff,
        variant: "info" as const,
        description: "approved leave",
      },
    ]
  }, [counts, rate])

  const busy = regenerate.isPending || processCutoff.isPending
  const isToday = date === freeTownDate()

  return (
    <DashboardLayout title="Cutoff Dashboard">
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          title="Daily Cutoff Report"
          description={`Snapshot frozen at 08:45 Africa/Freetown · ${formatDate(date)}`}
          icon={ClipboardList}
        >
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-full min-w-0 sm:w-40"
            max={freeTownDate()}
          />
          <Button variant="outline" size="sm" onClick={runRegenerate} disabled={busy}>
            <RefreshCw className={cn("mr-2 h-4 w-4", busy && "animate-spin")} />
            Refresh
          </Button>
          {canForce && (
            <Button variant="outline" size="sm" onClick={runCutoff} disabled={busy}>
              <PlayCircle className="mr-2 h-4 w-4" />
              Run cutoff
            </Button>
          )}
        </PageHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ActionTile
            href="/hr/attendance"
            title="Attendance"
            description="See who checked in or missed"
            icon={CalendarCheck2}
            accent="orange"
          />
          <ActionTile
            href="/hr/leave"
            title="Leave requests"
            description="Review and approve time off"
            icon={CalendarDays}
            accent="blue"
            badge={pendingLeave.data?.length}
          />
          <ActionTile
            href="/hr/corrections"
            title="Corrections"
            description="Fix wrong clock-in times"
            icon={FileClock}
            accent="purple"
            badge={pendingCorrections.data?.length}
          />
          <ActionTile
            href="/hr/employees"
            title="Employees"
            description="Manage staff and accounts"
            icon={Users}
            accent="green"
          />
        </div>

        {report.isLoading && (
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-32 md:col-span-2" />
            <Skeleton className="h-32" />
            <Skeleton className="h-28 md:col-span-3" />
          </div>
        )}

        {report.isError && (
          <Card className="border-destructive/30">
            <CardContent className="py-8">
              <EmptyState
                icon={Timer}
                title="Could not load the report"
                description={report.error instanceof Error ? report.error.message : "Try refreshing."}
                action={
                  <Button variant="outline" size="sm" onClick={runRegenerate} disabled={busy}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try again
                  </Button>
                }
              />
            </CardContent>
          </Card>
        )}

        {report.data && !counts && (
          <Card>
            <CardContent className="py-10">
              <EmptyState
                icon={Timer}
                title="No report for this date"
                description={
                  isToday
                    ? "The 08:45 snapshot has not been created yet. It is generated automatically at cutoff, or you can run it now."
                    : "No snapshot was stored for this date. Generate it to see the numbers as they should have been."
                }
                action={
                  <Button onClick={runRegenerate} disabled={busy}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Generate report
                  </Button>
                }
              />
            </CardContent>
          </Card>
        )}

        {counts && (
          <>
            <Card className="overflow-hidden border-primary/15">
              <div className="border-b border-border/60 bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                        On-time rate
                      </p>
                      <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                        {isToday ? "Today" : formatDate(date)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
                      {rate}%
                    </p>
                    <p className="mt-1 text-[12.5px] text-muted-foreground">
                      {counts.present} of {counts.scheduled} scheduled employees were in before the 08:45 cutoff
                      {counts.checked_in > 0 ? ` · ${counts.checked_in} checked in overall` : ""}.
                    </p>
                  </div>
                  <div className="flex gap-4 text-right">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Late</p>
                      <p className="text-xl font-bold text-amber-600 tabular-nums">{counts.late}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Absent</p>
                      <p className="text-xl font-bold text-red-600 tabular-nums">{counts.absent_at_cutoff}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">On leave</p>
                      <p className="text-xl font-bold text-blue-600 tabular-nums">{counts.on_leave}</p>
                    </div>
                  </div>
                </div>
                <Progress
                  value={attendanceRate}
                  className="mt-4 h-2"
                  indicatorClassName={cn(
                    attendanceRate >= 90 ? "bg-emerald-500" : attendanceRate >= 70 ? "bg-amber-500" : "bg-red-500"
                  )}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[11.5px] text-muted-foreground sm:px-5">
                <span>
                  Generated {report.data?.generated_at ? formatClock(report.data.generated_at) : "—"} · Cutoff{" "}
                  {report.data?.cutoff_time?.slice(0, 5) ?? "08:45"}
                </span>
                <span>{counts.pending} pending after cutoff</span>
              </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {stats.map((s) => (
                <StatCard
                  key={s.title}
                  title={s.title}
                  value={s.value}
                  description={s.description}
                  icon={s.icon}
                  variant={s.variant}
                />
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <SectionHeading title="Today's split" description="The 08:45 snapshot" icon={Timer} />
                </CardHeader>
                <CardContent className="flex items-center justify-center">
                  <DonutChart
                    centerLabel="on time"
                    centerValue={`${rate}%`}
                    segments={[
                      { label: "Present", value: counts.present, color: "#16a34a" },
                      { label: "Late", value: counts.late, color: "#f59e0b" },
                      { label: "Absent", value: counts.absent_at_cutoff, color: "#dc2626" },
                      { label: "On leave", value: counts.on_leave, color: "#2563eb" },
                    ]}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <SectionHeading
                    title="On-time rate — 7 reports"
                    description="Are we improving?"
                    icon={ClipboardList}
                  />
                </CardHeader>
                <CardContent>
                  <TrendChart points={trend} valueSuffix="%" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <SectionHeading title="Largest branches" description="By scheduled staff" icon={Users} />
                </CardHeader>
                <CardContent>
                  {branchBars.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No branch data.</p>
                  ) : (
                    <BarList items={branchBars} valueFormatter={(v) => `${v}`} />
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="gap-2 pb-3">
                  <SectionHeading
                    title="Breakdown by branch"
                    description="Compare attendance across the country"
                    icon={ClipboardList}
                    action={
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/hr/attendance?date=${date}&cutoff=absent`}>
                          View absentees
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    }
                  />
                </CardHeader>
                <CardContent>
                  {branchRows.length === 0 ? (
                    <EmptyState
                      icon={Users}
                      title="No branch data"
                      description="This report does not contain a branch breakdown."
                      compact
                    />
                  ) : (
                    <>
                      <div className="hidden overflow-x-auto md:block">
                        <table className="w-full min-w-[620px] text-sm">
                          <thead>
                            <tr className="border-b text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                              <th className="py-2.5 pr-4 font-semibold">Branch</th>
                              <th className="py-2.5 pr-4 text-right font-semibold">Scheduled</th>
                              <th className="py-2.5 pr-4 text-right font-semibold">Present</th>
                              <th className="py-2.5 pr-4 text-right font-semibold">Late</th>
                              <th className="py-2.5 pr-4 text-right font-semibold">Absent</th>
                              <th className="py-2.5 text-right font-semibold">On leave</th>
                            </tr>
                          </thead>
                          <tbody>
                            {branchRows.map((b) => (
                              <tr key={b.branch_id} className="border-b last:border-0 hover:bg-accent/30">
                                <td className="py-3 pr-4 font-medium">
                                  {b.name}
                                  <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">
                                    {b.code}
                                  </span>
                                </td>
                                <td className="py-3 pr-4 text-right tabular-nums">{b.scheduled}</td>
                                <td className="py-3 pr-4 text-right tabular-nums text-emerald-600">{b.present}</td>
                                <td className="py-3 pr-4 text-right tabular-nums text-amber-600">{b.late}</td>
                                <td className="py-3 pr-4 text-right tabular-nums text-red-600">
                                  {b.absent_at_cutoff}
                                </td>
                                <td className="py-3 text-right tabular-nums text-blue-600">{b.on_leave}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="space-y-2 md:hidden">
                        {branchRows.map((b) => (
                          <div key={b.branch_id} className="rounded-xl border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[13px] font-semibold">{b.name}</p>
                              <span className="font-mono text-[10.5px] text-muted-foreground">{b.code}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                              {[
                                ["In", b.present, "text-emerald-600"],
                                ["Late", b.late, "text-amber-600"],
                                ["Absent", b.absent_at_cutoff, "text-red-600"],
                                ["Leave", b.on_leave, "text-blue-600"],
                              ].map(([label, value, tone]) => (
                                <div key={String(label)} className="rounded-lg bg-muted/40 px-1 py-1.5">
                                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
                                  <p className={cn("mt-0.5 text-xs font-semibold tabular-nums", String(tone))}>
                                    {value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <SectionHeading title="Report details" description="Numbers behind the snapshot" icon={Timer} />
                  </CardHeader>
                  <CardContent className="space-y-2.5 text-[13px]">
                    {[
                      ["Cutoff time", report.data?.cutoff_time?.slice(0, 5) ?? "08:45"],
                      ["Generated at", report.data?.generated_at ? formatClock(report.data.generated_at) : "—"],
                      ["Checked in so far", counts.checked_in],
                      ["Absent now", counts.absent_now],
                      ["Total late minutes", counts.total_minutes_late],
                      ["Pending after cutoff", counts.pending],
                      ["Attendance rate", `${attendanceRate}%`],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular-nums">{value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <GuideCard
                  title="How the cutoff works"
                  description="The 08:45 snapshot is your source of truth."
                  steps={[
                    {
                      title: "At 08:45 every working day",
                      body: `Anyone without a check-in is recorded as ${STATUS_LABELS.absent} for that moment.`,
                    },
                    {
                      title: "The snapshot is frozen",
                      body: "It never changes, even if someone checks in later. Live status still updates.",
                    },
                    {
                      title: "Use it for reporting",
                      body: "Compare branches and spot teams that need support.",
                    },
                  ]}
                />

                {canForce && (
                  <Card>
                    <CardHeader className="pb-3">
                      <SectionHeading title="Admin actions" icon={Settings2} />
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={runRegenerate}
                        disabled={busy}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Regenerate this report
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={runCutoff}
                        disabled={busy}
                      >
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Run cutoff now (force)
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
