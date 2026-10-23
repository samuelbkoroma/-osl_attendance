"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PageHeader } from "@/components/layout/page-header"
import {
  StatCard,
  StatusBadge,
  CutoffBadge,
  EmptyState,
  SectionHeading,
  GuideCard,
  InlineLink,
} from "@/components/dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Callout } from "@/components/ui/callout"
import { useAuth } from "@/providers/auth-provider"
import { useToast } from "@/providers/toast-provider"
import {
  useMyEmployee,
  useTodayRecord,
  useMyAttendance,
  useCheckIn,
  useCheckOut,
  useRealtimeInvalidate,
  qk,
} from "@/lib/queries"
import {
  freeTownDate,
  isWorkday,
  isCutoffReached,
  cutoffMoment,
  cutoffTimeOf,
  nextAction,
  formatClock,
  formatMinutesLate,
  formatRemaining,
  scheduledWindow,
  STATUS_LABELS,
  statusDot,
} from "@/lib/attendance"
import {
  formatScheduleSummary,
  getGreeting,
  formatDate,
  getDayOfWeek,
  getSessionDuration,
  cn,
} from "@/lib/utils"
import { getBestEffortPosition, getCurrentPosition, isWithinDynamicCenter } from "@/lib/geofence"
import {
  LogIn,
  LogOut,
  MapPin,
  Clock3,
  CalendarCheck2,
  AlertTriangle,
  History,
  Timer,
  CheckCircle2,
  Circle,
  CalendarDays,
  ArrowRight,
  Sparkles,
  Coffee,
  ShieldCheck,
  QrCode,
} from "lucide-react"
import { QRBadgeModal } from "@/components/attendance/qr-badge-modal"

export default function EmployeeDashboard() {
  const { user } = useAuth()
  const { error: toastError, success, warning } = useToast()
  const my = useMyEmployee()
  const today = useTodayRecord()
  const checkIn = useCheckIn()
  const checkOut = useCheckOut()

  const [now, setNow] = useState(() => new Date())
  const [locating, setLocating] = useState(false)
  const [badgeOpen, setBadgeOpen] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const weekFrom = useMemo(() => freeTownDate(new Date(now.getTime() - 6 * 86400000)), [now])
  const weekTo = useMemo(() => freeTownDate(now), [now])
  const week = useMyAttendance({ from: weekFrom, to: weekTo })

  useRealtimeInvalidate(
    ["attendance_records", "notifications"],
    [qk.todayRecord, ["my-attendance"], ["notifications"], qk.unreadNotifications],
    "realtime-employee-home"
  )

  const employee = my.data?.employee
  const schedule = my.data?.schedule
  const settings = my.data?.settings
  const branch = employee?.branch

  const todayStr = freeTownDate(now)
  const workday = schedule ? isWorkday(todayStr, schedule) : false
  const cutoffAt = cutoffMoment(todayStr, cutoffTimeOf(settings ?? undefined))
  const cutoffMsLeft = cutoffAt.getTime() - now.getTime()
  const beforeCutoff = !isCutoffReached(now, todayStr, cutoffTimeOf(settings ?? undefined))

  const record = today.data ?? null
  const action = nextAction(record)

  const weekRows = useMemo(() => week.data ?? [], [week.data])
  const weekWorked = useMemo(
    () => weekRows.filter((r) => r.status !== "rest_day" && r.status !== "holiday"),
    [weekRows]
  )
  const weekPresent = weekWorked.filter((r) => r.status === "present" || r.status === "late").length
  const weekOnTime = weekWorked.filter((r) => r.status === "present").length
  const weekLate = weekWorked.filter((r) => r.status === "late").length

  const locationRequired = !!branch?.require_location || !!settings?.require_location
  const hasBranchCoords = branch?.latitude != null && branch?.longitude != null
  const shift = schedule ? scheduledWindow(todayStr, schedule) : null
  const shiftProgress = shift
    ? Math.max(0, Math.min(100, ((now.getTime() - shift.start.getTime()) / (shift.end.getTime() - shift.start.getTime())) * 100))
    : 0

  const clock = now.toLocaleTimeString("en-GB", {
    timeZone: "UTC",
    hour12: false,
  })

  const runCheckIn = useCallback(
    async (latitude?: number, longitude?: number) => {
      checkIn.mutate(
        { latitude, longitude },
        {
          onSuccess: (res) => {
            if (res.status === "late") {
              warning(
                "Checked in — marked late",
                `You checked in at ${formatClock(res.check_in)} (${formatMinutesLate(res.minutes_late)} after start).`
              )
            } else {
              success("You're checked in", `Clocked in at ${formatClock(res.check_in)}. Have a good day.`)
            }
          },
          onError: (err) => toastError("Check-in failed", err.message),
        }
      )
    },
    [checkIn, success, toastError, warning]
  )

  const handleCheckIn = useCallback(async () => {
    if (!branch || !settings) return

    if (locationRequired) {
      if (!hasBranchCoords) {
        toastError("Location not set up", "Your branch has no location configured yet. Please contact HR.")
        return
      }
      setLocating(true)
      try {
        const pos = await getCurrentPosition()
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const inside = isWithinDynamicCenter(
          lat,
          lng,
          {
            name: branch.name,
            latitude: branch.latitude as number,
            longitude: branch.longitude as number,
            radiusMeters: branch.radius_meters,
          },
          pos.coords.accuracy
        )
        setLocating(false)
        if (!inside) {
          toastError(
            "You're outside your branch",
            `Move within ${branch.radius_meters} m of ${branch.name}, then try again. If you're already on site, check that location is enabled.`
          )
          return
        }
        runCheckIn(lat, lng)
      } catch (err) {
        setLocating(false)
        const message =
          err instanceof GeolocationPositionError && err.code === err.PERMISSION_DENIED
            ? "Location is blocked. Allow location for this site in your browser settings, then try again."
            : err instanceof Error
              ? err.message
              : "Allow location access to check in."
        toastError("Location required", message)
      }
      return
    }

    setLocating(true)
    const pos = await getBestEffortPosition()
    setLocating(false)
    runCheckIn(pos?.coords.latitude, pos?.coords.longitude)
  }, [branch, settings, locationRequired, hasBranchCoords, runCheckIn, toastError])

  const handleCheckOut = useCallback(() => {
    checkOut.mutate(undefined, {
      onSuccess: (res) => success("Shift closed", `Checked out at ${formatClock(res.check_out)}. See you tomorrow!`),
      onError: (err) => toastError("Check-out failed", err.message),
    })
  }, [checkOut, success, toastError])

  const loading = my.isLoading
  const firstName = user?.full_name?.split(" ")[0] ?? "there"

  const journey = getJourneyCopy({ workday, action, record, firstName, locationRequired, branchName: branch?.name })
  const sessions = record?.check_in
    ? getSessionDuration(record.check_in, record.check_out)
    : null

  const steps = [
    {
      label: "Check in",
      caption: record?.check_in ? formatClock(record.check_in) : workday ? "When you arrive" : "Not needed today",
      state: record?.check_in ? "done" : workday ? "current" : "upcoming",
    },
    {
      label: "Work your shift",
      caption: sessions ? sessions : schedule ? `${schedule.start_time.slice(0, 5)} – ${schedule.end_time.slice(0, 5)}` : "—",
      state: !record?.check_in ? "upcoming" : record.check_out ? "done" : "current",
    },
    {
      label: "Check out",
      caption: record?.check_out ? formatClock(record.check_out) : "Before you leave",
      state: record?.check_out ? "done" : record?.check_in ? "current" : "upcoming",
    },
  ] as const

  return (
    <DashboardLayout title="My Dashboard">
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          title={`${getGreeting(now)}, ${firstName}`}
          description={`${getDayOfWeek(now)}, ${formatDate(now)} · ${formatScheduleSummary(schedule)}`}
          icon={CalendarCheck2}
        >
          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs shadow-[var(--elevation-1)]">
            <Timer className={cn("h-4 w-4", beforeCutoff ? "text-primary" : "text-muted-foreground")} />
            <span className="font-semibold tabular-nums">
              {beforeCutoff ? `Cutoff in ${formatRemaining(Math.max(0, cutoffMsLeft))}` : "Cutoff snapshot taken"}
            </span>
          </div>
        </PageHeader>

        {my.isError && (
          <Card className="border-destructive/30">
            <CardContent className="py-8">
              <EmptyState
                icon={AlertTriangle}
                title="Your employee record isn't linked yet"
                description={
                  my.error instanceof Error
                    ? my.error.message
                    : "Ask your HR administrator to link your staff account to an employee record. Once linked, your dashboard will appear here."
                }
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/profile">Open my profile</Link>
                  </Button>
                }
              />
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <div className="grid gap-4 md:grid-cols-3">
              <Skeleton className="h-40 md:col-span-2" />
              <Skeleton className="h-40" />
            </div>
          </div>
        )}

        {my.data && (
          <>
            <Card className="overflow-hidden border-0 bg-slate-900 text-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.55)]">
              <div className={cn("relative bg-gradient-to-br", journey.gradient)}>
                <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-black/10 blur-2xl" />
                <div className="relative grid gap-6 p-5 sm:p-7 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
                      {journey.badgeIcon}
                      {journey.badge}
                    </div>
                    <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
                      {journey.title}
                    </h2>
                    <p className="mt-1.5 max-w-lg text-[13.5px] leading-6 text-white/75 sm:text-sm">
                      {journey.description}
                    </p>

                    <div className="mt-5 flex flex-wrap items-center gap-2.5">
                      {action === "check_in" && workday && (
                        <Button
                          size="lg"
                          className="h-12 w-full bg-white px-7 text-[15px] font-bold text-slate-900 shadow-lg shadow-black/10 hover:bg-white/90 sm:w-auto"
                          onClick={handleCheckIn}
                          disabled={checkIn.isPending || locating}
                        >
                          {locating || checkIn.isPending ? (
                            <>
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                              {locating ? "Checking location…" : "Checking you in…"}
                            </>
                          ) : (
                            <>
                              <LogIn className="h-5 w-5" />
                              {locationRequired ? "Check in at this branch" : "Mark me present"}
                            </>
                          )}
                        </Button>
                      )}

                      {action === "check_out" && (
                        <Button
                          size="lg"
                          className="h-12 w-full bg-white px-7 text-[15px] font-bold text-slate-900 shadow-lg shadow-black/10 hover:bg-white/90 sm:w-auto"
                          onClick={handleCheckOut}
                          disabled={checkOut.isPending}
                        >
                          <LogOut className="h-5 w-5" />
                          {checkOut.isPending ? "Checking out…" : "Check out now"}
                        </Button>
                      )}

                      {action === "done" && (
                        <div className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold backdrop-blur">
                          <CheckCircle2 className="h-5 w-5" />
                          Shift complete — nothing left to do
                        </div>
                      )}

                      {!workday && (
                        <div className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold backdrop-blur">
                          <Coffee className="h-5 w-5" />
                          Enjoy your rest day
                        </div>
                      )}

                      <Button
                        asChild
                        variant="ghost"
                        size="lg"
                        className="h-12 border border-white/20 px-5 text-white hover:bg-white/10 hover:text-white"
                      >
                        <Link href="/employee/attendance">
                          <History className="h-4 w-4" />
                          My attendance
                        </Link>
                      </Button>

                      {employee && (
                        <Button
                          variant="ghost"
                          size="lg"
                          className="h-12 border border-white/20 px-5 text-white hover:bg-white/10 hover:text-white gap-2"
                          onClick={() => setBadgeOpen(true)}
                        >
                          <QrCode className="h-4 w-4 text-orange-200" />
                          Digital Badge
                        </Button>
                      )}
                    </div>

                    <div className="mt-6 grid gap-2 sm:grid-cols-3">
                      {steps.map((step, i) => (
                        <div
                          key={step.label}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 backdrop-blur",
                            step.state === "current"
                              ? "border-white/30 bg-white/15"
                              : "border-white/10 bg-white/[0.06]"
                          )}
                        >
                          {step.state === "done" ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                          ) : step.state === "current" ? (
                            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                              <span className="absolute h-3 w-3 animate-ping-soft rounded-full bg-white/60" />
                              <Circle className="h-4 w-4 text-white" />
                            </span>
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-white/35" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-white">
                              {i + 1}. {step.label}
                            </p>
                            <p className="truncate text-[10.5px] text-white/55">{step.caption}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur md:min-w-[180px] md:flex-col md:items-center md:justify-center md:py-5">
                    <div className="text-center">
                      <p className="font-mono text-3xl font-bold tabular-nums tracking-tight md:text-4xl">{clock}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                        Freetown time
                      </p>
                    </div>
                    <div className="h-10 w-px bg-white/15 md:h-px md:w-full" />
                    <div className="text-right md:text-center">
                      <p className="text-[11px] uppercase tracking-wider text-white/50">Shift</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {schedule ? `${schedule.start_time.slice(0, 5)} – ${schedule.end_time.slice(0, 5)}` : "—"}
                      </p>
                      {sessions && record?.check_in && !record.check_out && (
                        <p className="mt-0.5 text-[11px] text-emerald-300">On shift {sessions}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-primary" />
                        Today&apos;s shift
                      </CardTitle>
                      {record ? <CutoffBadge cutoff={record.cutoff_status} /> : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {shift && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                          <span>{workday ? "Shift progress" : "Rest day"}</span>
                          <span className="tabular-nums">{workday ? `${Math.round(shiftProgress)}%` : "—"}</span>
                        </div>
                        <Progress
                          value={workday ? shiftProgress : 0}
                          className="h-2 bg-secondary"
                          indicatorClassName={cn(
                            shiftProgress >= 100 ? "bg-emerald-500" : "bg-gradient-to-r from-orange-400 to-primary"
                          )}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <DetailTile
                        label="Status"
                        value={
                          record ? (
                            <StatusBadge status={record.status} />
                          ) : (
                            <span className="text-sm font-medium text-muted-foreground">
                              {workday ? "Not in yet" : "Rest day"}
                            </span>
                          )
                        }
                      />
                      <DetailTile label="Checked in" value={record?.check_in ? formatClock(record.check_in) : "—"} mono />
                      <DetailTile label="Checked out" value={record?.check_out ? formatClock(record.check_out) : "—"} mono />
                      <DetailTile
                        label="Late by"
                        value={record && record.minutes_late > 0 ? formatMinutesLate(record.minutes_late) : "—"}
                        tone={record && record.minutes_late > 0 ? "warning" : undefined}
                      />
                    </div>

                    {record?.status === "late" && (
                      <Callout variant="warning" title="You checked in late">
                        You were {formatMinutesLate(record.minutes_late)} past your scheduled start. If this was not
                        your fault, you can request a correction from My Attendance.
                      </Callout>
                    )}

                    {record && record.within_branch === false && (
                      <Callout variant="warning" title="Recorded outside the branch radius">
                        Your check-in was saved, but the location was outside {branch?.name ?? "your branch"}. HR can
                        review it if needed.
                      </Callout>
                    )}

                    {!beforeCutoff && record?.cutoff_status && (
                      <p className="text-xs leading-5 text-muted-foreground">
                        The 08:45 snapshot recorded you as{" "}
                        <span className="font-semibold text-foreground">{STATUS_LABELS[record.cutoff_status]}</span>.
                        Later check-ins still update your live status.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-[12px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {branch?.name ?? "No branch"}
                        {locationRequired ? " · location required" : " · location optional"}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {formatScheduleSummary(schedule)}
                      </span>
                      {employee?.employee_no && (
                        <span className="font-mono text-[11px]">ID {employee.employee_no}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <SectionHeading
                      title="Last 7 days"
                      description="Your recent attendance at a glance"
                      icon={CalendarDays}
                      action={<InlineLink href="/employee/attendance">View all</InlineLink>}
                    />
                  </CardHeader>
                  <CardContent>
                    {week.isLoading ? (
                      <div className="grid grid-cols-7 gap-2">
                        {Array.from({ length: 7 }).map((_, i) => (
                          <Skeleton key={i} className="h-20" />
                        ))}
                      </div>
                    ) : weekRows.length === 0 ? (
                      <EmptyState
                        icon={History}
                        title="No attendance yet"
                        description="Your check-ins from the past week will appear here."
                        compact
                      />
                    ) : (
                      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                        {[...weekRows]
                          .sort((a, b) => (a.work_date < b.work_date ? -1 : 1))
                          .map((row) => {
                            const d = new Date(`${row.work_date}T00:00:00Z`)
                            return (
                              <div
                                key={row.id}
                                className="group flex flex-col items-center rounded-xl border border-border/60 bg-card px-1 py-2.5 text-center transition-colors hover:border-primary/25 hover:bg-accent/40"
                                title={`${row.work_date} · ${STATUS_LABELS[row.status]}`}
                              >
                                <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  {d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
                                </span>
                                <span className="mt-0.5 text-sm font-bold tabular-nums">
                                  {d.getUTCDate()}
                                </span>
                                <span className={cn("mt-1.5 h-2 w-2 rounded-full", statusDot(row.status))} />
                                <span className="mt-1 hidden text-[9px] tabular-nums text-muted-foreground sm:block">
                                  {row.check_in ? formatClock(row.check_in) : "—"}
                                </span>
                              </div>
                            )
                          })}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-muted-foreground">
                      <Legend dot="bg-emerald-500" label="Present" />
                      <Legend dot="bg-amber-500" label="Late" />
                      <Legend dot="bg-red-500" label="Absent" />
                      <Legend dot="bg-sky-500" label="On leave" />
                      <Legend dot="bg-zinc-400" label="Rest day" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard
                    title="This week"
                    value={`${weekPresent}/${weekWorked.length || weekPresent}`}
                    description="days present"
                    icon={History}
                    variant="success"
                  />
                  <StatCard
                    title="On time"
                    value={weekOnTime}
                    description="days on time"
                    icon={Timer}
                    variant="info"
                  />
                  <StatCard
                    title="Late"
                    value={weekLate}
                    description="days this week"
                    icon={Clock3}
                    variant={weekLate > 0 ? "warning" : "default"}
                  />
                  <StatCard
                    title="Today"
                    value={record ? STATUS_LABELS[record.status] : workday ? "Pending" : "Rest"}
                    description={record?.check_in ? `In ${formatClock(record.check_in)}` : undefined}
                    icon={CalendarCheck2}
                    variant={
                      record?.status === "present"
                        ? "success"
                        : record?.status === "late"
                          ? "warning"
                          : record?.status === "absent"
                            ? "destructive"
                            : "default"
                    }
                  />
                </div>

                {!record && workday && action === "check_in" && (
                  <Callout variant="tip" title="First time checking in?">
                    Tap <span className="font-semibold text-foreground">Mark me present</span> when you arrive.
                    {locationRequired
                      ? " You must be at your branch and allow location access."
                      : " Your clock-in takes just a second."}{" "}
                    Then check out on this same card when you leave.
                  </Callout>
                )}

                <GuideCard
                  title="Your daily routine"
                  description="Three simple steps, every working day."
                  steps={[
                    { title: "Arrive and check in", body: locationRequired ? "Be inside your branch geofence, then tap check in." : "Tap check in when you start your day." },
                    { title: "Work your shift", body: "Your dashboard keeps a live clock and shows your progress." },
                    { title: "Check out before leaving", body: "Tap check out so your hours are recorded correctly." },
                  ]}
                  action={
                    <Link
                      href="/employee/attendance"
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                    >
                      Something missing? Request a correction
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  }
                />

                <Card>
                  <CardHeader className="pb-2.5">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Quick actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 p-2 pt-0">
                    <QuickLink href="/employee/leave" icon={CalendarDays} label="Request leave" />
                    <QuickLink href="/employee/attendance" icon={History} label="Attendance history & exports" />
                    <QuickLink href="/notifications" icon={CalendarCheck2} label="Check notifications" />
                    <QuickLink href="/profile" icon={ShieldCheck} label="My profile & schedule" />
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}

        {employee && (
          <QRBadgeModal
            open={badgeOpen}
            onOpenChange={setBadgeOpen}
            employee={{
              id: employee.id,
              employee_no: employee.employee_no,
              full_name: employee.full_name,
              job_title: employee.job_title,
              branch: employee.branch,
              department: employee.department,
              rank: employee.rank,
              profile: user,
            }}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

function getJourneyCopy({
  workday,
  action,
  record,
  firstName,
  locationRequired,
  branchName,
}: {
  workday: boolean
  action: "check_in" | "check_out" | "done" | "off_duty"
  record: { check_in: string | null; check_out: string | null; status: string } | null
  firstName: string
  locationRequired: boolean
  branchName?: string
}) {
  if (!workday) {
    return {
      gradient: "from-slate-800 via-slate-900 to-slate-900",
      badge: "Rest day",
      badgeIcon: <Coffee className="h-3 w-3" />,
      title: "No shift scheduled today",
      description: "Enjoy your day off. Your next working day will appear here automatically.",
    }
  }
  if (action === "done") {
    return {
      gradient: "from-emerald-600 via-emerald-700 to-teal-800",
      badge: "All done",
      badgeIcon: <CheckCircle2 className="h-3 w-3" />,
      title: `Great work today, ${firstName}`,
      description: `You checked in at ${record?.check_in ? formatClock(record.check_in) : "—"} and checked out at ${record?.check_out ? formatClock(record.check_out) : "—"}. Nothing else is needed.`,
    }
  }
  if (action === "check_out") {
    return {
      gradient: "from-slate-800 via-slate-900 to-slate-950",
      badge: "On shift",
      badgeIcon: <Clock3 className="h-3 w-3" />,
      title: "You're checked in",
      description: `Started at ${record?.check_in ? formatClock(record.check_in) : "—"}. Remember to check out when you leave so your hours are recorded.`,
    }
  }
  return {
    gradient: "from-orange-500 via-orange-600 to-amber-700",
    badge: "Ready to start",
    badgeIcon: <Sparkles className="h-3 w-3" />,
    title: `Ready when you are, ${firstName}`,
    description: locationRequired
      ? `Tap below when you arrive at ${branchName ?? "your branch"}. We'll confirm you're inside the branch area before checking you in.`
      : "Tap below to mark yourself present. You can check in from anywhere — no location needed for your branch.",
  }
}

function DetailTile({
  label,
  value,
  mono,
  tone,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  tone?: "warning"
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/35 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div
        className={cn(
          "mt-1.5 text-[15px] font-semibold",
          mono && "font-mono tabular-nums",
          tone === "warning" && "text-amber-600"
        )}
      >
        {value}
      </div>
    </div>
  )
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  )
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: React.ElementType
  label: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors hover:bg-accent/60"
    >
      <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
      <span className="flex-1">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  )
}
