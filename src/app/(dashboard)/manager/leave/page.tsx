"use client"

import React, { useMemo, useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState, StatCard, SectionHeading } from "@/components/dashboard"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  useLeaveRequests,
  useMyEmployee,
  useRealtimeInvalidate,
} from "@/lib/queries"
import { useQueryClient } from "@tanstack/react-query"
import type { LeaveRequest, LeaveStatus } from "@/types"
import { LEAVE_TYPE_LABELS } from "@/lib/attendance"
import { formatDate, formatDateShort, formatDateTime, getInitials, cn } from "@/lib/utils"
import {
  CalendarDays,
  Check,
  X,
  Search,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Users,
} from "lucide-react"

const STATUS_FILTERS: Array<{ value: LeaveStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
]

const LEAVE_STATUS_STYLES: Record<LeaveStatus, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-700 border-red-500/20",
  cancelled: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
}

function leaveDays(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00Z`).getTime()
  const e = new Date(`${end}T00:00:00Z`).getTime()
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0
  return Math.floor((e - s) / 86_400_000) + 1
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

export default function ManagerLeavePage() {
  const { error: toastError, success } = useToast()
  const queryClient = useQueryClient()
  const myEmployee = useMyEmployee()
  const managerBranchId = myEmployee.data?.employee.branch_id
  const branchName = myEmployee.data?.employee.branch?.name ?? "Your branch"

  const [status, setStatus] = useState<LeaveStatus | "all">("all")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<LeaveRequest | null>(null)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const requests = useLeaveRequests({
    branchId: managerBranchId,
  })

  useRealtimeInvalidate(
    ["leave_requests"],
    [["leave"], ["my-leave"], ["attendance"], ["daily-report"]],
    "realtime-manager-leave"
  )

  const all = useMemo(() => requests.data ?? [], [requests.data])

  const counts = useMemo(
    () => ({
      pending: all.filter((r) => r.status === "pending").length,
      approved: all.filter((r) => r.status === "approved").length,
      rejected: all.filter((r) => r.status === "rejected").length,
      total: all.length,
    }),
    [all]
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all
      .filter((r) => status === "all" || r.status === status)
      .filter(
        (r) =>
          !q ||
          (r.employee?.full_name ?? "").toLowerCase().includes(q) ||
          (r.employee?.employee_no ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  }, [all, status, query])

  const pager = usePagination(rows, 20)

  const decide = async (decision: "approved" | "rejected") => {
    if (!selected) return
    setSubmitting(true)

    try {
      const res = await fetch("/api/requests/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "leave",
          requestId: selected.id,
          decision,
          notes: notes.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Review failed")
      }

      success(
        decision === "approved" ? "Leave approved" : "Leave rejected",
        `${selected.employee?.full_name ?? "Employee"} · ${formatDate(selected.start_date)} – ${formatDate(
          selected.end_date
        )}`
      )
      setSelected(null)
      setNotes("")
      queryClient.invalidateQueries({ queryKey: ["leave"] })
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["daily-report"] })
    } catch (err) {
      toastError("Review failed", err instanceof Error ? err.message : "Try again")
    } finally {
      setSubmitting(false)
    }
  }

  const selectedDays = selected ? leaveDays(selected.start_date, selected.end_date) : 0
  const selectedWork = selected ? workingDays(selected.start_date, selected.end_date) : 0

  return (
    <DashboardLayout title="Team Leave Requests">
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          title="Team Leave Requests"
          description={`Review and approve leave applications for ${branchName}`}
          icon={CalendarDays}
        >
          <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[12px] text-amber-700">
            {counts.pending} pending
          </Badge>
        </PageHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Awaiting review"
            value={counts.pending}
            description="needs your decision"
            icon={CalendarClock}
            variant="warning"
          />
          <StatCard
            title="Approved"
            value={counts.approved}
            description="in your branch"
            icon={CheckCircle2}
            variant="success"
          />
          <StatCard
            title="Rejected"
            value={counts.rejected}
            description="declined requests"
            icon={XCircle}
          />
          <StatCard
            title="Total requests"
            value={counts.total}
            description="all historical submissions"
            icon={Users}
            variant="info"
          />
        </div>

        <Card>
          <CardHeader className="space-y-3 pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SectionHeading
                title="Branch applications"
                description={`${rows.length} request${rows.length === 1 ? "" : "s"} found`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      pager.setPage(1)
                    }}
                    placeholder="Search employee…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Select
                  value={status}
                  onValueChange={(v) => {
                    setStatus(v as LeaveStatus | "all")
                    pager.setPage(1)
                  }}
                >
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {requests.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No leave requests found"
                description={
                  query || status !== "all"
                    ? "Try adjusting the filters above."
                    : "No one in your branch has submitted leave requests yet."
                }
              />
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                        <th className="py-2.5 pr-4 font-semibold">Employee</th>
                        <th className="py-2.5 pr-4 font-semibold">Type</th>
                        <th className="py-2.5 pr-4 font-semibold">Dates</th>
                        <th className="py-2.5 pr-4 font-semibold">Duration</th>
                        <th className="py-2.5 pr-4 font-semibold">Status</th>
                        <th className="py-2.5 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pager.visible.map((req) => {
                        const total = leaveDays(req.start_date, req.end_date)
                        const work = workingDays(req.start_date, req.end_date)
                        return (
                          <tr key={req.id} className="border-b transition-colors last:border-0 hover:bg-accent/40">
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2.5">
                                <Avatar className="h-8 w-8 ring-1 ring-border shrink-0">
                                  <AvatarImage src={req.employee?.profile?.avatar_url ?? undefined} alt={req.employee?.full_name ?? ""} />
                                  <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                                    {getInitials(req.employee?.full_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <div className="font-medium leading-tight">{req.employee?.full_name ?? "—"}</div>
                                  <div className="font-mono text-[11px] text-muted-foreground">
                                    {req.employee?.employee_no}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 pr-4 font-medium text-[12.5px]">
                              {LEAVE_TYPE_LABELS[req.leave_type] ?? req.leave_type}
                            </td>
                            <td className="py-3 pr-4">
                              <div className="text-[12.5px] font-medium">
                                {formatDateShort(req.start_date)} → {formatDateShort(req.end_date)}
                              </div>
                              <div className="font-mono text-[10.5px] text-muted-foreground">
                                Submitted {formatDateShort(req.created_at)}
                              </div>
                            </td>
                            <td className="py-3 pr-4 tabular-nums text-[12.5px]">
                              {work} working day{work === 1 ? "" : "s"}
                              <span className="block text-[10.5px] text-muted-foreground">
                                {total} calendar day{total === 1 ? "" : "s"}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              <Badge variant="outline" className={cn("text-[11px]", LEAVE_STATUS_STYLES[req.status])}>
                                {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                              </Badge>
                            </td>
                            <td className="py-3 text-right">
                              {req.status === "pending" ? (
                                <Button size="sm" className="h-8 text-xs font-semibold" onClick={() => setSelected(req)}>
                                  Review
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs text-muted-foreground"
                                  onClick={() => setSelected(req)}
                                >
                                  Details
                                </Button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 md:hidden">
                  {pager.visible.map((req) => {
                    const total = leaveDays(req.start_date, req.end_date)
                    return (
                      <div key={req.id} className="rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8 ring-1 ring-border shrink-0">
                              <AvatarImage src={req.employee?.profile?.avatar_url ?? undefined} alt={req.employee?.full_name ?? ""} />
                              <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                                {getInitials(req.employee?.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-xs">{req.employee?.full_name ?? "—"}</p>
                              <p className="text-[11px] text-muted-foreground font-mono">{req.employee?.employee_no}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className={cn("text-[10px]", LEAVE_STATUS_STYLES[req.status])}>
                            {req.status}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs flex justify-between border-t pt-2">
                          <span className="font-medium">{LEAVE_TYPE_LABELS[req.leave_type]}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {formatDateShort(req.start_date)} – {formatDateShort(req.end_date)} ({total}d)
                          </span>
                        </div>
                        <div className="mt-2 text-right">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelected(req)}>
                            {req.status === "pending" ? "Review" : "View Details"}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4">
                  <PaginationBar
                    page={pager.page}
                    pageCount={pager.pageCount}
                    total={rows.length}
                    start={pager.start}
                    end={pager.end}
                    onPageChange={pager.setPage}
                    label="applications"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Review Dialog */}
        <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {selected?.status === "pending" ? "Review Leave Request" : "Leave Application Details"}
              </DialogTitle>
              <DialogDescription>
                Submitted by {selected?.employee?.full_name} ({selected?.employee?.employee_no})
              </DialogDescription>
            </DialogHeader>

            {selected && (
              <div className="space-y-4 py-2">
                <div className="rounded-xl border bg-muted/30 p-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-semibold">{LEAVE_TYPE_LABELS[selected.leave_type] ?? selected.leave_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dates:</span>
                    <span className="font-medium">
                      {formatDate(selected.start_date)} → {formatDate(selected.end_date)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="font-medium">
                      {selectedWork} working day{selectedWork === 1 ? "" : "s"} ({selectedDays} calendar)
                    </span>
                  </div>
                  {selected.reason && (
                    <div className="border-t pt-2">
                      <span className="text-muted-foreground block mb-0.5">Reason:</span>
                      <p className="italic text-foreground">{selected.reason}</p>
                    </div>
                  )}
                </div>

                {selected.status === "pending" ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Manager Review Notes (optional)</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add comments or instructions for the employee…"
                      className="text-xs min-h-[70px]"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border bg-card p-3 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reviewed:</span>
                      <span>{selected.reviewed_at ? formatDateTime(selected.reviewed_at) : "—"}</span>
                    </div>
                    {selected.review_notes && (
                      <div className="pt-1">
                        <span className="text-muted-foreground">Notes:</span>
                        <p className="mt-0.5">{selected.review_notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              {selected?.status === "pending" ? (
                <div className="flex w-full items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    disabled={submitting}
                    onClick={() => decide("rejected")}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 font-semibold"
                    disabled={submitting}
                    onClick={() => decide("approved")}
                  >
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    Approve
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                  Close
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
