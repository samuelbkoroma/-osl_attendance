"use client"

import React, { useMemo, useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState, StatCard, SectionHeading } from "@/components/dashboard"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
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
import { useMyLeave, useSubmitLeave, useCancelLeave } from "@/lib/queries"
import { LEAVE_TYPE_LABELS } from "@/lib/attendance"
import type { LeaveStatus } from "@/types"
import { formatDate, formatDateShort, cn } from "@/lib/utils"
import {
  CalendarDays,
  Plus,
  CalendarClock,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  FileText,
} from "lucide-react"

const LEAVE_TYPES = Object.keys(LEAVE_TYPE_LABELS).filter((k) => k !== "other")

const leaveStatusStyles: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-700 border-red-500/20",
  cancelled: "bg-slate-500/10 text-slate-500 border-slate-500/20",
}

const leaveAccent: Record<string, string> = {
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  cancelled: "bg-slate-400",
}

const FILTERS: Array<{ value: LeaveStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
]

function dayCount(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
}

function workingDays(start: string, end: string): number {
  if (!start || !end || end < start) return 0
  let count = 0
  const d = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (d <= last) {
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6) count += 1
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return count
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function EmployeeLeavePage() {
  const { error: toastError, success } = useToast()
  const leave = useMyLeave()
  const submit = useSubmitLeave()
  const cancel = useCancelLeave()

  const [open, setOpen] = useState(false)
  const [leaveType, setLeaveType] = useState("annual")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [reason, setReason] = useState("")
  const [filter, setFilter] = useState<LeaveStatus | "all">("all")

  const rows = useMemo(
    () =>
      [...(leave.data ?? [])].sort((a, b) => (a.start_date < b.start_date ? 1 : -1)),
    [leave.data]
  )

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  )

  const summary = useMemo(() => {
    const year = new Date().getFullYear()
    const approved = rows.filter((r) => r.status === "approved")
    const approvedDays = approved.reduce(
      (sum, r) => sum + (new Date(r.start_date).getFullYear() === year ? dayCount(r.start_date, r.end_date) : 0),
      0
    )
    const upcoming = approved.filter((r) => r.end_date >= today())
    return {
      pending: rows.filter((r) => r.status === "pending").length,
      approvedDays,
      upcoming: upcoming.length,
      total: rows.length,
    }
  }, [rows])

  const previewDays = startDate && endDate && endDate >= startDate ? dayCount(startDate, endDate) : 0
  const previewWorking = startDate && endDate && endDate >= startDate ? workingDays(startDate, endDate) : 0

  const handleSubmit = () => {
    if (!startDate || !endDate) {
      toastError("Dates required", "Select the start and end dates of your leave.")
      return
    }
    if (endDate < startDate) {
      toastError("Invalid range", "The end date cannot be before the start date.")
      return
    }
    submit.mutate(
      {
        leave_type: leaveType as never,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || undefined,
      },
      {
        onSuccess: () => {
          success("Leave request submitted", "HR will review it shortly.")
          setOpen(false)
          setReason("")
          setStartDate("")
          setEndDate("")
        },
        onError: (err) => toastError("Submission failed", err.message),
      }
    )
  }

  return (
    <DashboardLayout title="My Leave">
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          title="My Leave"
          description="Plan time off and follow every request from sent to approved"
          icon={CalendarDays}
        >
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New request
          </Button>
        </PageHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Awaiting review"
            value={summary.pending}
            description={summary.pending === 1 ? "request pending" : "requests pending"}
            icon={CalendarClock}
            variant="warning"
          />
          <StatCard
            title="Approved days"
            value={summary.approvedDays}
            description={`taken or booked in ${new Date().getFullYear()}`}
            icon={CheckCircle2}
            variant="success"
          />
          <StatCard
            title="Upcoming leave"
            value={summary.upcoming}
            description="approved trips ahead"
            icon={Sparkles}
            variant="info"
          />
          <StatCard
            title="Total requests"
            value={summary.total}
            description="all time"
            icon={FileText}
          />
        </div>

        <Card>
          <CardHeader className="gap-3 pb-3">
            <SectionHeading
              title="My requests"
              description="Newest first. Tap a filter to narrow the list."
              icon={CalendarDays}
            />
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {FILTERS.map((f) => {
                const count = f.value === "all" ? rows.length : rows.filter((r) => r.status === f.value).length
                const active = filter === f.value
                return (
                  <button
                    key={f.value}
                    onClick={() => setFilter(f.value)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {f.label}
                    <span className={cn("tabular-nums", active ? "text-primary-foreground/75" : "text-muted-foreground/70")}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </CardHeader>

          <CardContent>
            {leave.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            ) : leave.isError ? (
              <EmptyState
                icon={CalendarDays}
                title="Could not load leave"
                description={leave.error instanceof Error ? leave.error.message : "Try again shortly."}
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title={rows.length === 0 ? "No leave requests yet" : "Nothing in this filter"}
                description={
                  rows.length === 0
                    ? "When you request annual, sick or other leave, it will show up here with its status."
                    : "Try a different filter to see your other requests."
                }
                action={
                  rows.length === 0 ? (
                    <Button size="sm" onClick={() => setOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Request leave
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                      Show all
                    </Button>
                  )
                }
              />
            ) : (
              <div className="space-y-2.5">
                {filtered.map((row) => {
                  const days = dayCount(row.start_date, row.end_date)
                  const work = workingDays(row.start_date, row.end_date)
                  const isUpcoming = row.status === "approved" && row.start_date >= today()
                  return (
                    <div
                      key={row.id}
                      className="relative overflow-hidden rounded-xl border border-border/70 p-4 pl-5 transition-colors hover:bg-accent/30"
                    >
                      <span className={cn("absolute inset-y-0 left-0 w-1", leaveAccent[row.status])} />
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">
                              {LEAVE_TYPE_LABELS[row.leave_type] ?? row.leave_type}
                            </p>
                            <Badge variant="outline" className={cn("capitalize", leaveStatusStyles[row.status])}>
                              {row.status}
                            </Badge>
                            {isUpcoming && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                                <Sparkles className="h-3 w-3" />
                                Upcoming
                              </span>
                            )}
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px]">
                            <span className="font-medium">{formatDateShort(row.start_date)}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{formatDateShort(row.end_date)}</span>
                            <span className="text-muted-foreground">
                              · {days} day{days === 1 ? "" : "s"}
                              {work !== days ? ` (${work} working)` : ""}
                            </span>
                          </p>
                          {row.reason && (
                            <p className="mt-1.5 line-clamp-2 text-[12.5px] text-muted-foreground">{row.reason}</p>
                          )}
                          {row.review_notes && (
                            <p className="mt-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[11.5px] text-muted-foreground">
                              <span className="font-semibold text-foreground">Review note:</span> {row.review_notes}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5 text-right text-[10.5px] text-muted-foreground">
                          <div>
                            <p>Submitted</p>
                            <p className="font-medium text-foreground">{formatDate(row.created_at)}</p>
                          </div>
                          {row.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                              disabled={cancel.isPending && cancel.variables === row.id}
                              onClick={() => {
                                if (window.confirm("Cancel this leave request?")) {
                                  cancel.mutate(row.id, {
                                    onSuccess: () => success("Leave request cancelled"),
                                    onError: (err) => toastError("Could not cancel", err.message),
                                  })
                                }
                              }}
                            >
                              {cancel.isPending && cancel.variables === row.id ? "Cancelling…" : "Cancel"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Callout variant="tip" title="How leave works">
          Submit a request with your dates. HR reviews it and you&apos;ll get a notification with the decision. Approved leave is marked automatically on your attendance calendar.
        </Callout>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request leave</DialogTitle>
            <DialogDescription>Pick your dates and we&apos;ll send it for review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Leave type</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {LEAVE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="leave-start">From</Label>
                <Input
                  id="leave-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-end">To</Label>
                <Input
                  id="leave-end"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {previewDays > 0 ? (
              <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2 text-[12.5px]">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Duration
                </span>
                <span className="font-semibold">
                  {previewDays} day{previewDays === 1 ? "" : "s"}
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({previewWorking} working)
                  </span>
                </span>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed px-3 py-2 text-[12px] text-muted-foreground">
                Choose a start and end date to see the length of your leave.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="leave-reason">Reason</Label>
              <Textarea
                id="leave-reason"
                placeholder="Brief reason for your leave (optional but helpful)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>

            <Callout variant="info">
              You&apos;ll be notified when HR approves or rejects this request.
            </Callout>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submit.isPending}>
              {submit.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
