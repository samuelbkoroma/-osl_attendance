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
  useMyEmployee,
  useRealtimeInvalidate,
} from "@/lib/queries"
import { useQueryClient } from "@tanstack/react-query"
import type { CorrectionRequest, CorrectionStatus } from "@/types"
import { formatClock } from "@/lib/attendance"
import { formatDateShort, formatDateTime, getInitials, cn } from "@/lib/utils"
import {
  ClipboardPenLine,
  Check,
  X,
  Search,
  Clock3,
  CheckCircle2,
  XCircle,
  FileClock,
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

export default function ManagerCorrectionsPage() {
  const { error: toastError, success } = useToast()
  const queryClient = useQueryClient()
  const myEmployee = useMyEmployee()
  const managerBranchId = myEmployee.data?.employee.branch_id
  const branchName = myEmployee.data?.employee.branch?.name ?? "Your branch"

  const [status, setStatus] = useState<CorrectionStatus | "all">("all")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<CorrectionRequest | null>(null)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const corrections = useCorrections()

  useRealtimeInvalidate(
    ["attendance_correction_requests"],
    [["corrections"], ["my-corrections"], ["attendance"], ["daily-report"]],
    "realtime-manager-corrections"
  )

  // Scope to branch
  const all = useMemo(() => {
    const raw = corrections.data ?? []
    if (!managerBranchId) return raw
    return raw.filter((r) => r.employee?.branch_id === managerBranchId)
  }, [corrections.data, managerBranchId])

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
          (r.reason ?? "").toLowerCase().includes(q)
      )
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
          type: "correction",
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
        decision === "approved" ? "Correction approved" : "Correction rejected",
        `${selected.employee?.full_name ?? "Employee"} · ${formatDateShort(selected.work_date)}`
      )
      setSelected(null)
      setNotes("")
      queryClient.invalidateQueries({ queryKey: ["corrections"] })
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["daily-report"] })
    } catch (err) {
      toastError("Review failed", err instanceof Error ? err.message : "Try again")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DashboardLayout title="Team Corrections">
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          title="Attendance Corrections"
          description={`Review and resolve clock-in fix requests for ${branchName}`}
          icon={ClipboardPenLine}
        >
          <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[12px] text-amber-700">
            {counts.pending} pending
          </Badge>
        </PageHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Needs review"
            value={counts.pending}
            description="open correction requests"
            icon={Clock3}
            variant="warning"
          />
          <StatCard
            title="Approved"
            value={counts.approved}
            description="records amended"
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
            title="Total submissions"
            value={counts.total}
            description="in your branch"
            icon={FileClock}
            variant="info"
          />
        </div>

        <Card>
          <CardHeader className="space-y-3 pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SectionHeading
                title="Branch correction requests"
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
                    placeholder="Search employee or reason…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {STATUS_FILTERS.map((f) => (
                    <Button
                      key={f.value}
                      variant={status === f.value ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs capitalize"
                      onClick={() => {
                        setStatus(f.value)
                        pager.setPage(1)
                      }}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {corrections.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={ClipboardPenLine}
                title="No correction requests found"
                description={
                  query || status !== "all"
                    ? "Try adjusting your search or status filter."
                    : "When staff in your branch submit clock-in corrections, they will appear here."
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
                          <Avatar className="mt-0.5 h-8 w-8 shrink-0 ring-1 ring-border">
                            <AvatarImage src={req.employee?.profile?.avatar_url ?? undefined} alt={req.employee?.full_name ?? ""} />
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
                                className={cn("capitalize text-[11px]", CORRECTION_STATUS_STYLES[req.status])}
                              >
                                {req.status}
                              </Badge>
                            </div>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {req.employee?.employee_no}
                              {req.employee?.job_title ? ` · ${req.employee.job_title}` : ""}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                              <span className="font-medium text-foreground">Date: {formatDateShort(req.work_date)}</span>
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <Clock3 className="h-3 w-3" />
                                Proposed In: {req.proposed_check_in ? formatClock(req.proposed_check_in) : "—"} · Out:{" "}
                                {req.proposed_check_out ? formatClock(req.proposed_check_out) : "—"}
                              </span>
                            </div>
                            <p className="mt-1 text-[12px] text-muted-foreground bg-muted/40 p-2 rounded-lg italic">
                              &ldquo;{req.reason}&rdquo;
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <Button
                            variant={req.status === "pending" ? "default" : "outline"}
                            size="sm"
                            className="h-8 font-semibold text-xs"
                            onClick={() => {
                              setSelected(req)
                              setNotes("")
                            }}
                          >
                            {req.status === "pending" ? "Review" : "View Details"}
                          </Button>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDateTime(req.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
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

        {/* Review Dialog */}
        <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {selected?.status === "pending" ? "Review Attendance Correction" : "Correction Details"}
              </DialogTitle>
              <DialogDescription>
                Submitted by {selected?.employee?.full_name} ({selected?.employee?.employee_no})
              </DialogDescription>
            </DialogHeader>

            {selected && (
              <div className="space-y-4 py-2">
                <div className="rounded-xl border bg-muted/30 p-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Work Date:</span>
                    <span className="font-semibold">{formatDateShort(selected.work_date)} ({selected.work_date})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Proposed In:</span>
                    <span className="font-mono font-medium">
                      {selected.proposed_check_in ? formatClock(selected.proposed_check_in) : "No change"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Proposed Out:</span>
                    <span className="font-mono font-medium">
                      {selected.proposed_check_out ? formatClock(selected.proposed_check_out) : "No change"}
                    </span>
                  </div>
                  <div className="border-t pt-2">
                    <span className="text-muted-foreground block mb-0.5">Employee reason:</span>
                    <p className="italic text-foreground">{selected.reason}</p>
                  </div>
                </div>

                {selected.status === "pending" ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Manager Review Notes (optional)</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add an explanation or confirmation note…"
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
