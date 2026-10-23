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
import { Callout } from "@/components/ui/callout"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
  useBranches,
  useReviewLeave,
  useRealtimeInvalidate,
} from "@/lib/queries"
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

const ACCENTS: Record<LeaveStatus, string> = {
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  cancelled: "bg-zinc-400",
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

export default function HrLeavePage() {
  const { error: toastError, success } = useToast()
  const [status, setStatus] = useState<LeaveStatus | "all">("all")
  const [branchId, setBranchId] = useState("all")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<LeaveRequest | null>(null)
  const [notes, setNotes] = useState("")

  const branches = useBranches(true)
  const requests = useLeaveRequests({
    branchId: branchId === "all" ? undefined : branchId,
  })
  const review = useReviewLeave()

  useRealtimeInvalidate(
    ["leave_requests"],
    [["leave"], ["my-leave"], ["attendance"], ["daily-report"]],
    "realtime-hr-leave"
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

  const decide = (decision: "approved" | "rejected") => {
    if (!selected) return
    review.mutate(
      { id: selected.id, decision, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          success(
            decision === "approved" ? "Leave approved" : "Leave rejected",
            `${selected.employee?.full_name ?? "Employee"} · ${formatDate(selected.start_date)} – ${formatDate(
              selected.end_date
            )}`
          )
          setSelected(null)
          setNotes("")
        },
        onError: (err) => toastError("Review failed", err.message),
      }
    )
  }

  const selectedDays = selected ? leaveDays(selected.start_date, selected.end_date) : 0
  const selectedWork = selected ? workingDays(selected.start_date, selected.end_date) : 0

  return (
    <DashboardLayout title="Leave Requests">
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          title="Leave Requests"
          description="Review and decide employee leave applications"
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
            description="needs a decision"
            icon={CalendarClock}
            variant="warning"
          />
          <StatCard
            title="Approved"
            value={counts.approved}
            description="in this branch filter"
            icon={CheckCircle2}
            variant="success"
          />
          <StatCard
            title="Rejected"
            value={counts.rejected}
            description="not approved"
            icon={XCircle}
            variant="destructive"
          />
          <StatCard title="All requests" value={counts.total} description="visible here" icon={Users} />
        </div>

        <Card>
          <CardHeader className="gap-3 pb-3">
            <SectionHeading
              title="Requests"
              description="Newest first. Pending requests need your decision."
              icon={CalendarDays}
            />
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    pager.setPage(1)
                  }}
                  placeholder="Search employee name or number"
                  className="h-9 pl-8 text-[13px]"
                />
              </div>
              <Select
                value={branchId}
                onValueChange={(v) => {
                  setBranchId(v)
                  pager.setPage(1)
                }}
              >
                <SelectTrigger className="h-9 w-full lg:w-48">
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
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {STATUS_FILTERS.map((f) => {
                const count =
                  f.value === "all" ? all.length : all.filter((r) => r.status === f.value).length
                const active = status === f.value
                return (
                  <button
                    key={f.value}
                    onClick={() => {
                      setStatus(f.value)
                      pager.setPage(1)
                    }}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {f.label}
                    <span
                      className={cn(
                        "tabular-nums",
                        active ? "text-primary-foreground/75" : "text-muted-foreground/70"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </CardHeader>

          <CardContent>
            {requests.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : requests.isError ? (
              <EmptyState
                icon={CalendarDays}
                title="Could not load leave requests"
                description={requests.error instanceof Error ? requests.error.message : "Try again shortly."}
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title={all.length === 0 ? "No leave requests" : "Nothing matches"}
                description={
                  all.length === 0
                    ? "When employees request leave, their applications will appear here for review."
                    : "Try a different status, branch or search."
                }
                action={
                  all.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setStatus("all")
                        setQuery("")
                        setBranchId("all")
                        pager.setPage(1)
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="space-y-2">
                {pager.visible.map((req) => {
                  const days = leaveDays(req.start_date, req.end_date)
                  return (
                    <div
                      key={req.id}
                      className="relative overflow-hidden rounded-xl border border-border/70 p-3.5 pl-5 transition-colors hover:bg-accent/30"
                    >
                      <span className={cn("absolute inset-y-0 left-0 w-1", ACCENTS[req.status])} />
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <Avatar className="mt-0.5 h-8 w-8 shrink-0 ring-2 ring-primary/10">
                            <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                              {getInitials(req.employee?.full_name ?? "?")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">
                                {req.employee?.full_name ?? "—"}
                              </p>
                              <Badge
                                variant="outline"
                                className={cn("capitalize", LEAVE_STATUS_STYLES[req.status])}
                              >
                                {req.status}
                              </Badge>
                            </div>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {req.employee?.employee_no}
                              {req.employee?.branch ? ` · ${req.employee.branch.name}` : ""}
                            </p>
                            <p className="mt-1.5 text-[12.5px] font-medium">
                              {LEAVE_TYPE_LABELS[req.leave_type] ?? req.leave_type} ·{" "}
                              {req.start_date === req.end_date
                                ? formatDateShort(req.start_date)
                                : `${formatDateShort(req.start_date)} – ${formatDateShort(req.end_date)}`}
                              <span className="ml-1 font-normal text-muted-foreground">
                                ({days} day{days === 1 ? "" : "s"})
                              </span>
                            </p>
                            {req.reason && (
                              <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{req.reason}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <Button
                            variant={req.status === "pending" ? "default" : "outline"}
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setSelected(req)
                              setNotes("")
                            }}
                          >
                            {req.status === "pending" ? "Review" : "View"}
                          </Button>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDateTime(req.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

                <div className="mt-3">
                  <PaginationBar
                    page={pager.page}
                    pageCount={pager.pageCount}
                    total={rows.length}
                    start={pager.start}
                    end={pager.end}
                    onPageChange={pager.setPage}
                    label="requests"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Callout variant="info" title="What happens when you decide">
          Approving marks the selected dates as leave on the employee&apos;s attendance and notifies them. Rejecting keeps
          their normal schedule — add a note so they know why.
        </Callout>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selected?.status === "pending" ? "Review leave request" : "Leave request"}
            </DialogTitle>
            <DialogDescription>
              {selected?.employee?.full_name} · {selected?.employee?.employee_no}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">
                    {LEAVE_TYPE_LABELS[selected.leave_type] ?? selected.leave_type}
                  </p>
                  <Badge variant="outline" className={cn("capitalize", LEAVE_STATUS_STYLES[selected.status])}>
                    {selected.status}
                  </Badge>
                </div>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {formatDate(selected.start_date)} – {formatDate(selected.end_date)}
                </p>
                <p className="mt-1 text-[12px] font-medium">
                  {selectedDays} day{selectedDays === 1 ? "" : "s"}
                  <span className="font-normal text-muted-foreground"> ({selectedWork} working)</span>
                </p>
              </div>

              <div>
                <p className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">Reason</p>
                <p className="rounded-lg border bg-muted/40 p-3 text-[13px]">
                  {selected.reason || "No reason provided."}
                </p>
              </div>

              {selected.review_notes && (
                <div>
                  <p className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    Previous review notes
                  </p>
                  <p className="rounded-lg border bg-muted/40 p-3 text-[13px]">{selected.review_notes}</p>
                </div>
              )}

              {selected.status === "pending" && (
                <div className="space-y-2">
                  <Label htmlFor="leave-notes">Note to employee (optional)</Label>
                  <Textarea
                    id="leave-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any conditions or comments…"
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              {selected?.status === "pending" ? "Cancel" : "Close"}
            </Button>
            {selected?.status === "pending" && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => decide("rejected")}
                  disabled={review.isPending}
                >
                  <X className="mr-2 h-4 w-4" />
                  Reject
                </Button>
                <Button onClick={() => decide("approved")} disabled={review.isPending}>
                  <Check className="mr-2 h-4 w-4" />
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
