"use client"

import React, { Suspense, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge, CutoffBadge, EmptyState, StatCard, SectionHeading } from "@/components/dashboard"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
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
import { PaginationBar } from "@/components/ui/pagination-bar"
import { usePagination } from "@/lib/use-pagination"
import {
  useAttendance,
  useAttendanceExport,
  useBranches,
  useEmployees,
  useHrRecordAttendance,
  useRealtimeInvalidate,
} from "@/lib/queries"
import type { AttendanceRecord, AttendanceStatus, AttendanceSource } from "@/types"
import {
  freeTownDate,
  formatClock,
  formatMinutesLate,
  SOURCE_LABELS,
  SOURCE_STYLES,
  STATUS_LABELS,
} from "@/lib/attendance"
import { downloadCSV, downloadExcel } from "@/lib/export"
import { formatDateShort, getInitials, cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  ClipboardCheck,
  Plus,
  FileSpreadsheet,
  FileDown,
  Search,
  FilterX,
  Users,
  UserCheck,
  Clock3,
  UserX,
  Pencil,
  MapPin,
  AlertTriangle,
  ExternalLink,
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

const SOURCE_FILTERS: Array<{ value: AttendanceSource | "all"; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "self", label: "Self check-in" },
  { value: "kiosk", label: "Kiosk terminal" },
  { value: "manager", label: "Manager entry" },
  { value: "hr", label: "HR entry" },
  { value: "system", label: "System" },
]

const LOCATION_FILTERS: Array<{ value: "all" | "inside" | "outside"; label: string }> = [
  { value: "all", label: "All locations" },
  { value: "inside", label: "Inside branch" },
  { value: "outside", label: "Outside branch (warning)" },
]

/** Shared by the on-screen export and the full export, so both match. */
function toExportRows(rows: AttendanceRecord[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    Employee: r.employee?.full_name ?? "",
    "Employee no.": r.employee?.employee_no ?? "",
    Branch: r.branch?.name ?? "",
    Department: r.employee?.department?.name ?? "",
    Date: r.work_date,
    "Check-in": r.check_in ? formatClock(r.check_in) : "",
    "Check-out": r.check_out ? formatClock(r.check_out) : "",
    "Minutes late": r.minutes_late || "",
    Status: STATUS_LABELS[r.status],
    "At cutoff": r.cutoff_status ? STATUS_LABELS[r.cutoff_status] : "Not taken",
    "Within branch": r.within_branch === null ? "" : r.within_branch ? "Yes" : "No",
    Source: r.source ? SOURCE_LABELS[r.source] : "",
    Latitude: r.latitude ?? "",
    Longitude: r.longitude ?? "",
    "Check-in GPS":
      r.latitude === null || r.latitude === undefined
        ? ""
        : `${r.latitude}, ${r.longitude}`,
  }))
}

function HrAttendanceContent() {
  const { error: toastError, success } = useToast()
  const searchParams = useSearchParams()

  const today = freeTownDate()
  const dateParam = searchParams.get("date")
  const [from, setFrom] = useState(() => dateParam ?? today)
  const [to, setTo] = useState(() => dateParam ?? today)
  const [branchId, setBranchId] = useState("all")
  const [status, setStatus] = useState<AttendanceStatus | "all">("all")
  const [source, setSource] = useState<AttendanceSource | "all">("all")
  const [withinBranch, setWithinBranch] = useState<"all" | "inside" | "outside">("all")
  const [cutoffAbsentOnly, setCutoffAbsentOnly] = useState(
    () => searchParams.get("cutoff") === "absent"
  )
  const [query, setQuery] = useState("")

  const branches = useBranches(true)
  const employees = useEmployees({ limit: 400 })

  const filters = useMemo(
    () => ({
      from,
      to,
      branchId: branchId === "all" ? undefined : branchId,
      status,
      source: source === "all" ? undefined : source,
      withinBranch: withinBranch === "all" ? undefined : withinBranch,
      cutoffAbsentOnly: cutoffAbsentOnly || undefined,
      query: query.trim() || undefined,
    }),
    [from, to, branchId, status, source, withinBranch, cutoffAbsentOnly, query]
  )
  const attendance = useAttendance(filters)
  const recordMutation = useHrRecordAttendance()

  useRealtimeInvalidate(
    ["attendance_records", "daily_attendance_reports"],
    [["attendance"], ["daily-report"], ["daily-reports"]],
    "realtime-hr-attendance"
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState("")
  const [recordDate, setRecordDate] = useState(today)
  const [inTime, setInTime] = useState("")
  const [outTime, setOutTime] = useState("")
  const [reason, setReason] = useState("")
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null)

  const rows = useMemo(() => attendance.data ?? [], [attendance.data])
  const pager = usePagination(rows, 25)

  const summary = useMemo(
    () => ({
      records: rows.length,
      present: rows.filter((r) => r.status === "present").length,
      late: rows.filter((r) => r.status === "late").length,
      absent: rows.filter((r) => r.cutoff_status === "absent").length,
    }),
    [rows]
  )

  const hasFilters =
    from !== today ||
    to !== today ||
    branchId !== "all" ||
    status !== "all" ||
    source !== "all" ||
    withinBranch !== "all" ||
    cutoffAbsentOnly ||
    !!query

  const resetFilters = () => {
    setFrom(today)
    setTo(today)
    setBranchId("all")
    setStatus("all")
    setSource("all")
    setWithinBranch("all")
    setCutoffAbsentOnly(false)
    setQuery("")
    pager.setPage(1)
  }

  const exportMutation = useAttendanceExport()

  const runExport = (format: "csv" | "xlsx") => {
    exportMutation.mutate(filters, {
      onSuccess: (allRows) => {
        if (allRows.length === 0) {
          toastError("Nothing to export", "No records match the current filters.")
          return
        }
        const exportData = toExportRows(allRows)
        const name = `attendance-${from}-to-${to}`
        if (format === "csv") {
          downloadCSV(name, exportData)
        } else {
          downloadExcel(name, exportData, "Attendance")
        }
        success(
          "Export ready",
          `${allRows.length} record${allRows.length === 1 ? "" : "s"} exported.`
        )
      },
      onError: (err) => toastError("Export failed", err.message),
    })
  }

  const openNew = () => {
    setEditingRecord(null)
    setSelectedEmployee("")
    setRecordDate(today)
    setInTime("")
    setOutTime("")
    setReason("")
    setDialogOpen(true)
  }

  const openEdit = (record: AttendanceRecord) => {
    setEditingRecord(record)
    setSelectedEmployee(record.employee_id)
    setRecordDate(record.work_date)
    setInTime(record.check_in ? record.check_in.slice(11, 16) : "")
    setOutTime(record.check_out ? record.check_out.slice(11, 16) : "")
    setReason("")
    setDialogOpen(true)
  }

  const saveRecord = () => {
    if (!selectedEmployee) {
      toastError("Employee required", "Select an employee.")
      return
    }
    if (!inTime && !outTime) {
      toastError("Times required", "Provide at least a check-in or check-out time.")
      return
    }
    if (!reason.trim() || reason.trim().length < 5) {
      toastError("Reason required", "Give a brief reason for this record (audit log).")
      return
    }

    recordMutation.mutate(
      {
        employee_id: selectedEmployee,
        work_date: recordDate,
        check_in: inTime ? `${recordDate}T${inTime}:00Z` : null,
        check_out: outTime ? `${recordDate}T${outTime}:00Z` : null,
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          success("Attendance saved", "The record was written and classified.")
          setDialogOpen(false)
        },
        onError: (err) => toastError("Save failed", err.message),
      }
    )
  }

  return (
    <DashboardLayout title="Attendance Records">
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          title="Attendance Records"
          description="All check-ins across branches — filter, export and amend"
          icon={ClipboardCheck}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length === 0 || exportMutation.isPending}
            onClick={() => runExport("csv")}
          >
            <FileDown className="mr-2 h-4 w-4" />
            {exportMutation.isPending ? "Exporting…" : "CSV"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length === 0 || exportMutation.isPending}
            onClick={() => runExport("xlsx")}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Record attendance
          </Button>
        </PageHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Records in view"
            value={summary.records}
            description={from === to ? formatDateShort(from) : `${formatDateShort(from)} – ${formatDateShort(to)}`}
            icon={Users}
          />
          <StatCard
            title="Present"
            value={summary.present}
            description="on time"
            icon={UserCheck}
            variant="success"
          />
          <StatCard
            title="Late"
            value={summary.late}
            description="after shift start"
            icon={Clock3}
            variant="warning"
          />
          <StatCard
            title="Absent at 08:45"
            value={summary.absent}
            description="missed cutoff"
            icon={UserX}
            variant="destructive"
          />
        </div>

        <Card>
          <CardHeader className="gap-3 pb-3">
            <SectionHeading
              title="Find records"
              description="Narrow by date, branch, status or employee"
              icon={Search}
              action={
                hasFilters ? (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>
                    <FilterX className="mr-1.5 h-3.5 w-3.5" />
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-12">
              <div className="space-y-1 lg:col-span-3">
                <Label className="text-[11px] text-muted-foreground">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      pager.setPage(1)
                    }}
                    placeholder="Name, number or role"
                    className="h-9 pl-8"
                  />
                </div>
              </div>
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-[11px] text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value)
                    pager.setPage(1)
                  }}
                  className="h-9"
                />
              </div>
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-[11px] text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value)
                    pager.setPage(1)
                  }}
                  className="h-9"
                />
              </div>
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-[11px] text-muted-foreground">Branch</Label>
                <Select
                  value={branchId}
                  onValueChange={(v) => {
                    setBranchId(v)
                    pager.setPage(1)
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {(branches.data ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 lg:col-span-3">
                <Label className="text-[11px] text-muted-foreground">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => {
                    setStatus(v as AttendanceStatus | "all")
                    pager.setPage(1)
                  }}
                >
                  <SelectTrigger className="h-9">
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
              <div className="space-y-1 sm:col-span-1 lg:col-span-6">
                <Label className="text-[11px] text-muted-foreground">Check-in Source</Label>
                <Select
                  value={source}
                  onValueChange={(v) => {
                    setSource(v as AttendanceSource | "all")
                    pager.setPage(1)
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_FILTERS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-1 lg:col-span-6">
                <Label className="text-[11px] text-muted-foreground">Location / Geofence</Label>
                <Select
                  value={withinBranch}
                  onValueChange={(v) => {
                    setWithinBranch(v as "all" | "inside" | "outside")
                    pager.setPage(1)
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_FILTERS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={cutoffAbsentOnly ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setCutoffAbsentOnly((v) => !v)}
              >
                <UserX className="mr-1.5 h-3.5 w-3.5" />
                Absent at 08:45 only
              </Button>
              <span className="text-[11.5px] text-muted-foreground">
                {attendance.isFetching ? "Updating…" : `${rows.length} record${rows.length === 1 ? "" : "s"}`}
              </span>
            </div>
          </CardHeader>

          <CardContent>
            {attendance.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : attendance.isError ? (
              <EmptyState
                icon={ClipboardCheck}
                title="Could not load attendance"
                description={attendance.error instanceof Error ? attendance.error.message : "Try again."}
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="No records match"
                description="Nothing matches these filters. Clear them to see today's records, or record attendance manually."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Clear filters
                    </Button>
                    <Button size="sm" onClick={openNew}>
                      <Plus className="mr-2 h-4 w-4" />
                      Record attendance
                    </Button>
                  </div>
                }
              />
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                        <th className="py-2.5 pr-4 font-semibold">Employee</th>
                        <th className="py-2.5 pr-4 font-semibold">Branch</th>
                        <th className="py-2.5 pr-4 font-semibold">Date</th>
                        <th className="py-2.5 pr-4 font-semibold">In</th>
                        <th className="py-2.5 pr-4 font-semibold">Out</th>
                        <th className="py-2.5 pr-4 font-semibold">Late</th>
                        <th className="py-2.5 pr-4 font-semibold">Status</th>
                        <th className="py-2.5 pr-4 font-semibold">At 08:45</th>
                        <th className="py-2.5 pr-4 font-semibold">Source</th>
                        <th className="py-2.5 pr-4 font-semibold">Location</th>
                        <th className="py-2.5 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pager.visible.map((row) => (
                        <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-accent/40">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8 ring-1 ring-border shrink-0">
                                <AvatarImage src={row.employee?.profile?.avatar_url ?? undefined} alt={row.employee?.full_name ?? ""} />
                                <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                                  {getInitials(row.employee?.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="font-medium truncate">{row.employee?.full_name ?? "—"}</div>
                                <div className="truncate font-mono text-[11px] text-muted-foreground">
                                  {row.employee?.employee_no}
                                  {row.employee?.job_title ? ` · ${row.employee.job_title}` : ""}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-[12.5px] text-muted-foreground">
                            {row.branch?.name ?? "—"}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="text-[12.5px] font-medium">{formatDateShort(row.work_date)}</div>
                            <div className="font-mono text-[10.5px] text-muted-foreground">{row.work_date}</div>
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {row.check_in ? formatClock(row.check_in) : "—"}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {row.check_out ? formatClock(row.check_out) : "—"}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {row.minutes_late > 0 ? (
                              <span className="font-medium text-warning">{formatMinutesLate(row.minutes_late)}</span>
                            ) : (
                              "—"
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
                            <div className="flex flex-col gap-1 items-start">
                              {row.within_branch === true ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 whitespace-nowrap">
                                  <MapPin className="h-3 w-3 text-emerald-600" />
                                  Inside
                                </span>
                              ) : row.within_branch === false ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 whitespace-nowrap"
                                  title="Clocked in outside configured branch radius"
                                >
                                  <AlertTriangle className="h-3 w-3 text-rose-600" />
                                  Outside
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">—</span>
                              )}
                              {row.latitude !== null && row.longitude !== null && (
                                <a
                                  href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-primary transition-colors"
                                  title="View GPS location on map"
                                >
                                  <ExternalLink className="h-2.5 w-2.5" />
                                  GPS
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-right">
                            <Button variant="ghost" size="sm" className="h-8" onClick={() => openEdit(row)}>
                              <Pencil className="mr-1.5 h-3.5 w-3.5" />
                              Amend
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 md:hidden">
                  {pager.visible.map((row) => (
                    <div key={row.id} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar className="h-8 w-8 ring-1 ring-border shrink-0">
                            <AvatarImage src={row.employee?.profile?.avatar_url ?? undefined} alt={row.employee?.full_name ?? ""} />
                            <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                              {getInitials(row.employee?.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold">{row.employee?.full_name ?? "—"}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {row.employee?.employee_no} · {row.branch?.name ?? "—"}
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={row.status} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px]">
                        <span className="font-medium">{formatDateShort(row.work_date)}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {row.check_in ? formatClock(row.check_in) : "—"} →{" "}
                          {row.check_out ? formatClock(row.check_out) : "—"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
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
                          {row.minutes_late > 0 && (
                            <span className="text-[11px] font-medium text-warning">
                              {formatMinutesLate(row.minutes_late)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {row.latitude !== null && row.longitude !== null && (
                            <a
                              href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Map
                            </a>
                          )}
                          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => openEdit(row)}>
                            Amend
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  <PaginationBar
                    page={pager.page}
                    pageCount={pager.pageCount}
                    total={rows.length}
                    start={pager.start}
                    end={pager.end}
                    onPageChange={pager.setPage}
                    label="records"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Callout variant="info" title="Amending records">
          Changes made here go through the HR audit-logged path. Always add a clear reason — it is stored with the
          record and helps during reviews.
        </Callout>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Amend attendance record" : "Record attendance"}</DialogTitle>
            <DialogDescription>
              {editingRecord
                ? "Update the times below. This action is audit-logged."
                : "Create a record for an employee. This action is audit-logged."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editingRecord ? (
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {(employees.data ?? []).map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name} — {e.employee_no}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-semibold">{editingRecord.employee?.full_name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {editingRecord.employee?.employee_no} · {formatDateShort(editingRecord.work_date)}
                  </p>
                </div>
                <StatusBadge status={editingRecord.status} />
              </div>
            )}

            {editingRecord && (
              <div className="grid grid-cols-2 gap-2 rounded-xl border p-3 text-[12.5px]">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current in</p>
                  <p className="font-semibold tabular-nums">
                    {editingRecord.check_in ? formatClock(editingRecord.check_in) : "None"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current out</p>
                  <p className="font-semibold tabular-nums">
                    {editingRecord.check_out ? formatClock(editingRecord.check_out) : "None"}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="rec-date">Work date</Label>
              <Input
                id="rec-date"
                type="date"
                value={recordDate}
                max={today}
                onChange={(e) => setRecordDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rec-in">Check-in</Label>
                <Input id="rec-in" type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rec-out">Check-out</Label>
                <Input id="rec-out" type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rec-reason">Why are you changing this?</Label>
              <Textarea
                id="rec-reason"
                placeholder="e.g. Kiosk was offline in the morning; verified with branch manager."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground">
                Required, at least 5 characters. Saved in the audit log.
              </p>
            </div>

            <Callout variant="info">
              Times use Africa/Freetown (UTC). At least one of check-in or check-out is required.
            </Callout>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveRecord} disabled={recordMutation.isPending}>
              {recordMutation.isPending ? "Saving…" : "Save record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}

export default function HrAttendancePage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout title="Attendance Records">
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-40" />
          </div>
        </DashboardLayout>
      }
    >
      <HrAttendanceContent />
    </Suspense>
  )
}
