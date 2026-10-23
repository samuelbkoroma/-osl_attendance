"use client"

import React, { useMemo, useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge, CutoffBadge, EmptyState, StatCard, SectionHeading } from "@/components/dashboard"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Callout } from "@/components/ui/callout"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/providers/toast-provider"
import { useMyAttendance, useMyCorrections, useSubmitCorrection, useCancelCorrection } from "@/lib/queries"
import type { AttendanceRecord, AttendanceStatus, CorrectionStatus } from "@/types"
import {
  formatClock,
  formatMinutesLate,
  freeTownDate,
  STATUS_LABELS,
  SOURCE_LABELS,
  SOURCE_STYLES,
} from "@/lib/attendance"
import { formatDateShort, cn } from "@/lib/utils"
import { downloadCSV, downloadExcel } from "@/lib/export"
import {
  History,
  FileSpreadsheet,
  FileDown,
  FileClock,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  XCircle,
  Info,
  MapPin,
  AlertTriangle,
} from "lucide-react"

const STATUS_FILTERS: Array<{ value: AttendanceStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "on_leave", label: "On leave" },
  { value: "pending", label: "Pending" },
  { value: "rest_day", label: "Rest day" },
  { value: "holiday", label: "Holiday" },
  { value: "official_duty", label: "Official duty" },
]

const correctionStyles: Record<CorrectionStatus, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-700 border-red-500/20",
}

function monthStart(month: string): string {
  return `${month}-01`
}

function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0))
  return last.toISOString().slice(0, 10)
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ""
  return iso.slice(0, 16)
}

export default function EmployeeAttendancePage() {
  const { error: toastError, success } = useToast()
  const now = new Date()
  const currentMonth = freeTownDate(now).slice(0, 7)

  const [month, setMonth] = useState(currentMonth)
  const [status, setStatus] = useState<AttendanceStatus | "all">("all")
  const [correctionFor, setCorrectionFor] = useState<AttendanceRecord | null>(null)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctionDate, setCorrectionDate] = useState("")
  const [proposedIn, setProposedIn] = useState("")
  const [proposedOut, setProposedOut] = useState("")
  const [reason, setReason] = useState("")

  const filters = useMemo(
    () => ({ from: monthStart(month), to: monthEnd(month), status }),
    [month, status]
  )
  const attendance = useMyAttendance(filters)
  const corrections = useMyCorrections()
  const submitCorrection = useSubmitCorrection()
  const cancelCorrection = useCancelCorrection()

  const pendingByDate = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const c of corrections.data ?? []) {
      if (c.status === "pending") map.set(c.work_date, true)
    }
    return map
  }, [corrections.data])

  const rows = useMemo(() => attendance.data ?? [], [attendance.data])

  const summary = useMemo(() => {
    const worked = rows.filter((r) => r.status !== "rest_day" && r.status !== "holiday")
    const present = worked.filter((r) => r.status === "present").length
    const late = worked.filter((r) => r.status === "late").length
    const absent = worked.filter((r) => r.status === "absent").length
    const onLeave = worked.filter((r) => r.status === "on_leave").length
    const lateMinutes = worked.reduce((sum, r) => sum + (r.minutes_late || 0), 0)
    const rate = worked.length > 0 ? Math.round(((present + late) / worked.length) * 100) : 0

    const sorted = [...worked].sort((a, b) => (a.work_date < b.work_date ? 1 : -1))
    let onTimeStreak = 0
    for (const r of sorted) {
      if (r.status === "present") onTimeStreak += 1
      else if (r.status === "late" || r.status === "absent") break
      else continue
    }

    return { worked: worked.length, present, late, absent, onLeave, lateMinutes, rate, onTimeStreak }
  }, [rows])

  const exportRows = useMemo(
    () =>
      rows.map((r) => ({
        Date: r.work_date,
        "Check-in": r.check_in ? formatClock(r.check_in) : "",
        "Check-out": r.check_out ? formatClock(r.check_out) : "",
        "Minutes late": r.minutes_late || "",
        Status: STATUS_LABELS[r.status],
        "At cutoff": r.cutoff_status ? STATUS_LABELS[r.cutoff_status] : "Not taken",
        Source: r.source,
      })),
    [rows]
  )

  const recentCorrections = useMemo(
    () =>
      [...(corrections.data ?? [])]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 5),
    [corrections.data]
  )

  const openCorrection = (record: AttendanceRecord) => {
    setCorrectionFor(record)
    setCorrectionDate(record.work_date)
    setProposedIn(toLocalInput(record.check_in))
    setProposedOut(toLocalInput(record.check_out))
    setReason("")
    setCorrectionOpen(true)
  }

  const openMissingDay = () => {
    setCorrectionFor(null)
    setCorrectionDate(freeTownDate())
    setProposedIn("")
    setProposedOut("")
    setReason("")
    setCorrectionOpen(true)
  }

  const submit = () => {
    if (!correctionDate) {
      toastError("Date required", "Choose the day you want to correct.")
      return
    }
    if (correctionDate > freeTownDate()) {
      toastError("Invalid date", "You cannot request a correction for a future date.")
      return
    }
    if (pendingByDate.get(correctionDate)) {
      toastError("Already pending", "A correction for this day is already waiting for review.")
      return
    }
    if (!reason.trim() || reason.trim().length < 5) {
      toastError("Reason required", "Please give a short reason (at least 5 characters).")
      return
    }
    if (!proposedIn && !proposedOut) {
      toastError("Times required", "Provide a proposed check-in or check-out time.")
      return
    }

    const toTz = (v: string) => (v ? `${v}:00Z` : null)

    submitCorrection.mutate(
      {
        work_date: correctionDate,
        proposed_check_in: toTz(proposedIn),
        proposed_check_out: toTz(proposedOut),
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          success("Correction submitted", "HR will review your request and notify you.")
          setCorrectionOpen(false)
        },
        onError: (err) => toastError("Submission failed", err.message),
      }
    )
  }

  const canCorrect = (record: AttendanceRecord) =>
    record.work_date <= freeTownDate() &&
    record.status !== "rest_day" &&
    record.status !== "holiday" &&
    !pendingByDate.get(record.work_date)

  const isCurrentMonth = month >= currentMonth

  return (
    <DashboardLayout title="My Attendance">
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          title="My Attendance"
          description="Every clock-in, status and correction in one place"
          icon={History}
        >
          <Button variant="outline" size="sm" onClick={openMissingDay}>
            <CalendarPlus className="mr-2 h-4 w-4" />
            Missing day
          </Button>
          <Button variant="outline" size="sm" disabled={rows.length === 0}
            onClick={() => downloadCSV(`attendance-${month}`, exportRows)}>
            <FileDown className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" disabled={rows.length === 0}
            onClick={() => downloadExcel(`attendance-${month}`, exportRows, "Attendance")}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel
          </Button>
        </PageHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Attendance rate"
            value={`${summary.rate}%`}
            description={`${summary.present + summary.late} of ${summary.worked} working days`}
            icon={History}
            variant={summary.rate >= 90 ? "success" : summary.rate >= 70 ? "warning" : "destructive"}
          />
          <StatCard
            title="On-time streak"
            value={summary.onTimeStreak}
            description="consecutive on-time days"
            icon={CheckCircle2}
            variant="info"
          />
          <StatCard
            title="Late days"
            value={summary.late}
            description={summary.lateMinutes > 0 ? `${summary.lateMinutes} min total` : "No late minutes"}
            icon={FileClock}
            variant="warning"
          />
          <StatCard
            title="Absent"
            value={summary.absent}
            description={`${summary.onLeave} day${summary.onLeave === 1 ? "" : "s"} on leave`}
            icon={XCircle}
            variant="destructive"
          />
        </div>

        <Card>
          <CardHeader className="gap-3 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setMonth((m) => shiftMonth(m, -1))}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-[140px] text-center">
                  <p className="text-sm font-semibold">{monthLabel(month)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {rows.length} record{rows.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                  disabled={isCurrentMonth}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {month !== currentMonth && (
                  <Button variant="ghost" size="sm" className="ml-1 text-xs" onClick={() => setMonth(currentMonth)}>
                    This month
                  </Button>
                )}
              </div>

              <Select
                value={status}
                onValueChange={(v) => setStatus(v as AttendanceStatus | "all")}
              >
                <SelectTrigger className="w-full min-w-0 sm:w-44 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                <span>Monthly attendance</span>
                <span className="tabular-nums">{summary.rate}%</span>
              </div>
              <Progress
                value={summary.rate}
                className="h-2"
                indicatorClassName={cn(
                  summary.rate >= 90
                    ? "bg-emerald-500"
                    : summary.rate >= 70
                      ? "bg-amber-500"
                      : "bg-red-500"
                )}
              />
            </div>
          </CardHeader>

          <CardContent>
            {attendance.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : attendance.isError ? (
              <EmptyState
                icon={History}
                title="Could not load attendance"
                description={attendance.error instanceof Error ? attendance.error.message : "Try again shortly."}
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No records this month"
                description="Nothing was recorded for this month. Try another month or clear the status filter."
                action={
                  <Button variant="outline" size="sm" onClick={() => { setStatus("all"); setMonth(currentMonth) }}>
                    Reset filters
                  </Button>
                }
              />
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                        <th className="py-2.5 pr-4 font-semibold">Date</th>
                        <th className="py-2.5 pr-4 font-semibold">Check-in</th>
                        <th className="py-2.5 pr-4 font-semibold">Check-out</th>
                        <th className="py-2.5 pr-4 font-semibold">Late</th>
                        <th className="py-2.5 pr-4 font-semibold">Status</th>
                        <th className="py-2.5 pr-4 font-semibold">At 08:45</th>
                        <th className="py-2.5 pr-4 font-semibold">Source</th>
                        <th className="py-2.5 pr-4 font-semibold">Location</th>
                        <th className="py-2.5 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-accent/40">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{formatDateShort(row.work_date)}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">{row.work_date}</div>
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {row.check_in ? formatClock(row.check_in) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {row.check_out ? formatClock(row.check_out) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {row.minutes_late > 0 ? (
                              <span className="font-medium text-warning">{formatMinutesLate(row.minutes_late)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="py-3 pr-4">
                            <CutoffBadge cutoff={row.cutoff_status} />
                          </td>
                          <td className="py-3 pr-4">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px] font-medium whitespace-nowrap",
                                SOURCE_STYLES[row.source] ?? "bg-slate-100 text-slate-700"
                              )}
                            >
                              {SOURCE_LABELS[row.source] ?? row.source}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4">
                            {row.within_branch === true ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 whitespace-nowrap">
                                <MapPin className="h-3 w-3 text-emerald-600" />
                                Inside
                              </span>
                            ) : row.within_branch === false ? (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 whitespace-nowrap"
                                title="Outside branch perimeter"
                              >
                                <AlertTriangle className="h-3 w-3 text-rose-600" />
                                Outside
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            {pendingByDate.get(row.work_date) ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                                <FileClock className="h-3.5 w-3.5" />
                                Correction pending
                              </span>
                            ) : canCorrect(row) ? (
                              <Button variant="ghost" size="sm" className="h-8" onClick={() => openCorrection(row)}>
                                Request correction
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="space-y-2 md:hidden">
                  {rows.map((row) => (
                    <div key={row.id} className="rounded-xl border border-border/70 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{formatDateShort(row.work_date)}</p>
                          <p className="font-mono text-[10.5px] text-muted-foreground">{row.work_date}</p>
                        </div>
                        <StatusBadge status={row.status} />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-muted/40 px-1 py-1.5">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">In</p>
                          <p className="mt-0.5 text-xs font-semibold tabular-nums">
                            {row.check_in ? formatClock(row.check_in) : "—"}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/40 px-1 py-1.5">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Out</p>
                          <p className="mt-0.5 text-xs font-semibold tabular-nums">
                            {row.check_out ? formatClock(row.check_out) : "—"}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/40 px-1 py-1.5">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Late</p>
                          <p className={cn("mt-0.5 text-xs font-semibold tabular-nums", row.minutes_late > 0 && "text-warning")}>
                            {row.minutes_late > 0 ? formatMinutesLate(row.minutes_late) : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <CutoffBadge cutoff={row.cutoff_status} />
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] py-0 px-1.5",
                              SOURCE_STYLES[row.source] ?? "bg-slate-100 text-slate-700"
                            )}
                          >
                            {SOURCE_LABELS[row.source] ?? row.source}
                          </Badge>
                          {row.within_branch === true ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                              <MapPin className="h-2.5 w-2.5 text-emerald-600" />
                              Inside
                            </span>
                          ) : row.within_branch === false ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-700 bg-rose-500/10 px-1.5 py-0.5 rounded-full border border-rose-500/20">
                              <AlertTriangle className="h-2.5 w-2.5 text-rose-600" />
                              Outside
                            </span>
                          ) : null}
                        </div>
                        {pendingByDate.get(row.work_date) ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                            <FileClock className="h-3.5 w-3.5" />
                            Pending
                          </span>
                        ) : canCorrect(row) ? (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openCorrection(row)}>
                            Request correction
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <SectionHeading
                title="Correction requests"
                description="Track requests you have sent to HR"
                icon={FileClock}
              />
            </CardHeader>
            <CardContent>
              {corrections.isLoading ? (
                <Skeleton className="h-16" />
              ) : recentCorrections.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-[13px] text-muted-foreground">
                  You haven&apos;t requested any corrections. If you forget to clock in, use “Request correction” on
                  that day above.
                </p>
              ) : (
                <div className="divide-y">
                  {recentCorrections.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">{formatDateShort(c.work_date)}</p>
                        <p className="truncate text-[11.5px] text-muted-foreground">{c.reason}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {c.proposed_check_in ? formatClock(c.proposed_check_in) : "—"} –{" "}
                          {c.proposed_check_out ? formatClock(c.proposed_check_out) : "—"}
                        </span>
                        <Badge variant="outline" className={cn("capitalize", correctionStyles[c.status])}>
                          {c.status}
                        </Badge>
                        {c.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                            disabled={cancelCorrection.isPending && cancelCorrection.variables === c.id}
                            onClick={() => {
                              if (window.confirm("Cancel this correction request?")) {
                                cancelCorrection.mutate(c.id, {
                                  onSuccess: () => success("Correction request cancelled"),
                                  onError: (err) => toastError("Could not cancel", err.message),
                                })
                              }
                            }}
                          >
                            {cancelCorrection.isPending && cancelCorrection.variables === c.id
                              ? "Cancelling…"
                              : "Cancel"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border/60 bg-gradient-to-br from-primary/[0.07] to-transparent p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Info className="h-4 w-4 text-primary" />
                Forgot to clock in?
              </h3>
              <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
                You can ask HR to fix a day&apos;s record without leaving this page.
              </p>
            </div>
            <CardContent className="space-y-3 p-4">
              <ol className="space-y-2 text-[12.5px] leading-5 text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-bold text-primary">1.</span> Find the day in the table.
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">2.</span> Tap “Request correction”.
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">3.</span> Add the real times and a short reason.
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">4.</span> Wait for HR to approve — you&apos;ll be notified.
                </li>
              </ol>
              <Callout variant="tip">
                Requests are reviewed during working hours. Keep your reason short and clear.
              </Callout>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{correctionFor ? "Request a correction" : "Request a missing day"}</DialogTitle>
            <DialogDescription>
              For {correctionDate ? formatDateShort(correctionDate) : "the selected day"}. HR will review the times you enter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!correctionFor && (
              <div className="space-y-2">
                <Label htmlFor="corr-date">Day to correct</Label>
                <Input
                  id="corr-date"
                  type="date"
                  value={correctionDate}
                  max={freeTownDate()}
                  onChange={(e) => setCorrectionDate(e.target.value)}
                />
              </div>
            )}
            {correctionFor && (
              <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/30 p-3 text-[12.5px]">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current in</p>
                  <p className="font-semibold tabular-nums">
                    {correctionFor.check_in ? formatClock(correctionFor.check_in) : "None"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current out</p>
                  <p className="font-semibold tabular-nums">
                    {correctionFor.check_out ? formatClock(correctionFor.check_out) : "None"}
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="corr-in">Correct check-in</Label>
              <Input
                id="corr-in"
                type="datetime-local"
                value={proposedIn}
                onChange={(e) => setProposedIn(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="corr-out">Correct check-out</Label>
              <Input
                id="corr-out"
                type="datetime-local"
                value={proposedOut}
                onChange={(e) => setProposedOut(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="corr-reason">What happened?</Label>
              <Textarea
                id="corr-reason"
                placeholder="e.g. I arrived at 08:05 but the kiosk was offline."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground">At least 5 characters. This goes to HR.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitCorrection.isPending}>
              {submitCorrection.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
