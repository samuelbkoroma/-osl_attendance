"use client"

import React, { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/dashboard"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/providers/toast-provider"
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useRealtimeInvalidate,
} from "@/lib/queries"
import { formatDateTime, cn } from "@/lib/utils"
import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  CalendarDays,
  FileClock,
  ClipboardList,
  AlertTriangle,
} from "lucide-react"

type Filter = "all" | "unread"

function groupLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((today.getTime() - target.getTime()) / 86_400_000)
  if (diff <= 0) return "Today"
  if (diff === 1) return "Yesterday"
  if (diff < 7) return "This week"
  return "Earlier"
}

function iconFor(title: string) {
  const t = title.toLowerCase()
  if (t.includes("leave")) return CalendarDays
  if (t.includes("correction")) return FileClock
  if (t.includes("report") || t.includes("cutoff")) return ClipboardList
  if (t.includes("alert") || t.includes("missed")) return AlertTriangle
  return Bell
}

export default function NotificationsPage() {
  const router = useRouter()
  const { error: toastError, success } = useToast()
  const [filter, setFilter] = useState<Filter>("all")
  const notifications = useNotifications(100)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  useRealtimeInvalidate(["notifications"], [["notifications"]], "realtime-notifications")

  const rows = useMemo(() => notifications.data ?? [], [notifications.data])
  const unread = rows.filter((n) => !n.is_read).length

  const visible = useMemo(
    () => (filter === "unread" ? rows.filter((n) => !n.is_read) : rows),
    [rows, filter]
  )

  const groups = useMemo(() => {
    const map = new Map<string, typeof visible>()
    for (const n of visible) {
      const key = groupLabel(n.created_at)
      const list = map.get(key) ?? []
      list.push(n)
      map.set(key, list)
    }
    return Array.from(map.entries())
  }, [visible])

  const open = (id: string, link: string | null, isRead: boolean) => {
    if (!isRead) markRead.mutate(id)
    if (link) router.push(link)
  }

  return (
    <DashboardLayout title="Notifications">
      <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
        <PageHeader
          title="Notifications"
          description={unread > 0 ? `${unread} unread update${unread === 1 ? "" : "s"}` : "You're all caught up"}
          icon={Bell}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={unread === 0 || markAll.isPending}
            onClick={() =>
              markAll.mutate(undefined, {
                onSuccess: () => success("All marked as read"),
                onError: (err) => toastError("Action failed", err.message),
              })
            }
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark all read
          </Button>
        </PageHeader>

        <div className="flex items-center gap-1.5">
          {(
            [
              { value: "all", label: "All", count: rows.length },
              { value: "unread", label: "Unread", count: unread },
            ] as Array<{ value: Filter; label: string; count: number }>
          ).map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors",
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
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {notifications.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <EmptyState
                icon={BellRing}
                title={rows.length === 0 ? "No notifications yet" : "No unread notifications"}
                description={
                  rows.length === 0
                    ? "Leave decisions, corrections and daily report updates will appear here."
                    : "You have read everything. Switch to All to see past notifications."
                }
                action={
                  rows.length > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                      View all
                    </Button>
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {groups.map(([label, items]) => (
              <div key={label} className="space-y-2">
                <p className="px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {label}
                </p>
                <Card className="overflow-hidden">
                  <CardContent className="divide-y p-0">
                    {items.map((n) => {
                      const Icon = iconFor(n.title)
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => open(n.id, n.link, n.is_read)}
                          className={cn(
                            "flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/50",
                            !n.is_read && "bg-primary/[0.035]"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1",
                              n.is_read
                                ? "bg-muted text-muted-foreground ring-border"
                                : "bg-primary/10 text-primary ring-primary/15"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className={cn("text-sm", n.is_read ? "font-medium" : "font-semibold")}>
                                {n.title}
                              </p>
                              {!n.is_read && (
                                <Badge
                                  variant="outline"
                                  className="h-4 border-primary/20 bg-primary/10 px-1.5 text-[10px] text-primary"
                                >
                                  New
                                </Badge>
                              )}
                            </div>
                            {n.body && (
                              <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-5 text-muted-foreground">
                                {n.body}
                              </p>
                            )}
                            <p className="mt-1 text-[10.5px] text-muted-foreground">
                              {formatDateTime(n.created_at)}
                            </p>
                          </div>
                          <div className="mt-1 flex shrink-0 items-center gap-1.5">
                            {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                            {n.link && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </button>
                      )
                    })}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
