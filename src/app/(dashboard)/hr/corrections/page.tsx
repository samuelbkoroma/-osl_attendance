"use client"

import React, { useMemo, useState } from "react"
import Link from "next/link"
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
  useCorrections,
  useReviewCorrection,
  useRealtimeInvalidate,
} from "@/lib/queries"
import type { CorrectionRequest, CorrectionStatus } from "@/types"
import { canManageSettings } from "@/lib/navigation"
import { useAuth } from "@/providers/auth-provider"
import { formatClock } from "@/lib/attendance"
import { formatDate, formatDateShort, formatDateTime, getInitials, cn } from "@/lib/utils"
import {
  ClipboardPenLine,
  Check,
  X,
  Search,
  Clock3,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react"

const STATUS_FILTERS: Array<{ value: CorrectionStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
]

const CORRECTION_STATUS_STYLES: Record<CorrectionStatus, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-700 border-red-500/20",
}

const ACCENTS: Record<CorrectionStatus, string> = {
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
}

export default function HrCorrectionsPage() {
  const { error: toastError, success } = useToast()
  const { user } = useAuth()
  // review_correction_request() is guarded by is_hr_admin() in SQL, so an
  // hr_officer must not be offered the approve/reject controls.
  const canReview = canManageSettings(user?.role)
  const [status, setStatus] = useState<CorrectionStatus | "all">("all")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<CorrectionRequest | null>(null)
  const [notes, setNotes] = useState("")

  const corrections = useCorrections()
  const review = useReviewCorrection()

  useRealtimeInvalidate(
    ["attendance_correction_requests"],
    [["corrections"], ["my-corrections"], ["attendance"], ["daily-report"]],
    "realtime-hr-corrections"
  )

  const all = useMemo(() => corrections.data ?? [], [corrections.data])

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
          (r.employee?.employee_no ?? "").toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q)
      )
  }, [all, status, query])

  const pager = usePagination(rows, 20)

  const decide = (decision: "approved" | "rejected") => {
    if (!selected) return
    review.mutate(
      { id: selected.id, decision, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          success(
            decision === "approved" ? "Correction applied" : "Correction rejected",
            `${selected.employee?.full_name ?? "Employee"} · ${formatDate(selected.work_date)}`
          )
          setSelected(null)
          setNotes("")
        },
        onError: (err) => toastError("Review failed", err.message),
      }
    )
  }

  return (
    <DashboardLayout title="Corrections">
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          title="Attendance Corrections"
          description="Requests to amend check-in or check-out times"
          icon={ClipboardPenLine}
        >
          <Badge
            variant="outline"
            className="border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[12px] text-amber-700"
          >
            {counts.pending} pending
          </Badge>
        </PageHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Awaiting review"
            value={counts.pending}
            description="needs a decision"
            icon={Clock3}
            variant="warning"
          />
          <StatCard
            title="Approved"
            value={counts.approved}
            description="times were applied"
            icon={CheckCircle2}
            variant="success"
          />
          <StatCard
            title="Rejected"
            value={counts.rejected}
            description="records unchanged"
            icon={XCircle}
            variant="destructive"
          />
          <StatCard title="All requests" value={counts.total} description="most recent 300" icon={ClipboardPenLine} />
        </div>

        <Card>
          <CardHeader className="gap-3 pb-3">
            <SectionHeading
              title="Correction requests"
              description="Newest first. Review the proposed times and reason before deciding."
              icon={ClipboardPenLine}
            />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employee or reason"
                className="h-9 pl-8 text-[13px]"
              />
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
            {corrections.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : corrections.isError ? (
              <EmptyState
                icon={ClipboardPenLine}
                title="Could not load corrections"
                description={corrections.error instanceof Error ? corrections.error.message : "Try again shortly."}
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={ClipboardPenLine}
                title={all.length === 0 ? "No correction requests" : "Nothing matches"}
                description={
                  all.length === 0
                    ? "When employees ask to fix a clock-in time, their requests will appear here."
                    : "Try a different status or search."
                }
                action={
                  all.length > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => { setStatus("all"); setQuery(""); pager.setPage(1) }}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="space-y-2">
                {pager.visible.map((req) => (
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
                              className={cn("capitalize", CORRECTION_STATUS_STYLES[req.status])}
                            >
                              {req.status}
                            </Badge>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {req.employee?.employee_no}
                            {req.employee?.branch ? ` · ${req.employee.branch.name}` : ""}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                            <span className="font-medium">{formatDateShort(req.work_date)}</span>
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Clock3 className="h-3 w-3" />
                              In {req.proposed_check_in ? formatClock(req.proposed_check_in) : "—"} · Out{" "}
                              {req.proposed_check_out ? formatClock(req.proposed_check_out) : "—"}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{req.reason}</p>
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
                    label="requests"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Callout variant="info" title="What happens when you approve">
          The proposed times are written to the attendance record through the audit-logged path. Status and late
          minutes are reclassified automatically, and the employee is notified.
        </Callout>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selected?.status === "pending" ? "Review correction" : "Correction request"}
            </DialogTitle>
            <DialogDescription>
              {selected?.employee?.full_name} · {selected?.employee?.employee_no} ·{" "}
              {selected ? formatDate(selected.work_date) : ""}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/30 p-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Proposed check-in
                  </p>
                  <p className="font-semibold tabular-nums">
                    {selected.proposed_check_in ? formatClock(selected.proposed_check_in) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Proposed check-out
                  </p>
                  <p className="font-semibold tabular-nums">
                    {selected.proposed_check_out ? formatClock(selected.proposed_check_out) : "—"}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  Employee&apos;s reason
                </p>
                <p className="rounded-lg border bg-muted/40 p-3 text-[13px]">{selected.reason}</p>
              </div>

              {selected.review_notes && (
                <div>
                  <p className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    Previous review notes
                  </p>
                  <p className="rounded-lg border bg-muted/40 p-3 text-[13px]">{selected.review_notes}</p>
                </div>
              )}

              <Link
                href={`/hr/attendance?date=${selected.work_date}`}
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
              >
                Open that day&apos;s attendance
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>

              {selected.status === "pending" && canReview && (
                <div className="space-y-2">
                  <Label htmlFor="corr-notes">Note to employee (optional)</Label>
                  <Textarea
                    id="corr-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any comments…"
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
            {selected?.status === "pending" && canReview && (
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
            {selected?.status === "pending" && !canReview && (
              <p className="text-xs text-muted-foreground sm:self-center">
                Only HR administrators can approve or reject corrections.
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
