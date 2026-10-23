"use client"

import React from "react"
import Link from "next/link"
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Compass,
  Fingerprint,
  HelpCircle,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/providers/auth-provider"
import { homeForRole, isHrRole } from "@/lib/navigation"
import { cn } from "@/lib/utils"

interface Step {
  title: string
  body: string
  icon: React.ElementType
  href?: string
  action?: string
}

function stepsFor(role: string | null | undefined): Step[] {
  if (isHrRole(role)) {
    return [
      {
        title: "Check the 08:45 cutoff",
        body: "Start on the dashboard. It shows who was present, late or absent at the daily snapshot.",
        icon: Clock3,
        href: "/hr",
        action: "Open dashboard",
      },
      {
        title: "Clear requests",
        body: "Approve leave and attendance corrections. Employees are notified automatically.",
        icon: CheckCircle2,
        href: "/hr/leave",
        action: "Review leave",
      },
      {
        title: "Keep records accurate",
        body: "Search attendance, fix a missed clock-in, and export CSV or Excel when needed.",
        icon: CalendarCheck2,
        href: "/hr/attendance",
        action: "Open attendance",
      },
      {
        title: "Set up your workplace",
        body: "Add branches, departments, schedules and holidays so everyone is classified correctly.",
        icon: Compass,
        href: "/hr/settings",
        action: "Open settings",
      },
    ]
  }

  if (role === "branch_manager") {
    return [
      {
        title: "See your branch at a glance",
        body: "Your dashboard shows everyone in your branch and who has not clocked in yet.",
        icon: Users,
        href: "/manager",
        action: "Open dashboard",
      },
      {
        title: "Follow up with your team",
        body: "Use My Team to look up a person's status and check who is on leave.",
        icon: Users,
        href: "/manager/team",
        action: "View my team",
      },
      {
        title: "Log your own attendance",
        body: "You are an employee too — clock in and out from your personal dashboard.",
        icon: Fingerprint,
        href: "/employee",
        action: "Clock in",
      },
    ]
  }

  return [
    {
      title: "Clock in when you arrive",
      body: "Open your dashboard and tap Mark Present. If your branch requires it, allow location access.",
      icon: Fingerprint,
      href: "/employee",
      action: "Go to dashboard",
    },
    {
      title: "Clock out before you leave",
      body: "Tap Check Out on the same card. That closes your shift for the day.",
      icon: Clock3,
    },
    {
      title: "Request leave in advance",
      body: "Choose the dates and leave type. You can follow the approval status on the same page.",
      icon: CalendarDays,
      href: "/employee/leave",
      action: "Request leave",
    },
    {
      title: "Fix a forgotten clock-in",
      body: "Open My Attendance and choose Request correction for that day. HR will review it.",
      icon: CalendarCheck2,
      href: "/employee/attendance",
      action: "Open attendance",
    },
  ]
}

const STATUS_GUIDE = [
  {
    label: "Present",
    body: "Clocked in within the grace period.",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  },
  {
    label: "Late",
    body: "Clocked in after the grace period.",
    className: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  },
  {
    label: "Absent @ cutoff",
    body: "No clock-in by the daily 08:45 snapshot.",
    className: "bg-red-500/10 text-red-700 border-red-500/20",
  },
  {
    label: "On leave",
    body: "Approved leave covers that day.",
    className: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  },
  {
    label: "Pending",
    body: "Not due yet or waiting for the cutoff.",
    className: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  },
  {
    label: "Rest day",
    body: "Not a scheduled working day for you.",
    className: "bg-zinc-500/10 text-zinc-600 border-zinc-500/20",
  },
]

const FAQS = [
  {
    q: "Why do I need to allow location?",
    a: "Some branches use a geofence so you can only clock in while on site. If location is optional for your branch, your clock-in still works without it. You can enable location in your browser settings and refresh the page.",
  },
  {
    q: "I forgot to clock in. What should I do?",
    a: "Open My Attendance, find the day, and choose Request correction. Enter the times you actually worked and a short reason. HR will review and apply it.",
  },
  {
    q: "What happens at 08:45?",
    a: "A snapshot is taken of who is present, late or absent. It stays frozen for reporting, even if someone clocks in later. Your live status still updates.",
  },
  {
    q: "Who reviews my leave request?",
    a: "HR or your branch manager reviews leave requests. You will receive an in-app notification when a decision is made.",
  },
]

export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth()
  const steps = stepsFor(user?.role)
  const home = homeForRole(user?.role)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-5">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
            <HelpCircle className="h-5 w-5" />
          </div>
          <DialogTitle className="text-xl">How to use this workspace</DialogTitle>
          <DialogDescription>
            A quick guide for {isHrRole(user?.role) ? "HR" : user?.role === "branch_manager" ? "branch managers" : "employees"}.
            Everything important is one or two taps away.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Quick start
            </p>
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div
                  key={step.title}
                  className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{step.title}</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{step.body}</p>
                    {step.href && (
                      <Link
                        href={step.href}
                        onClick={() => onOpenChange(false)}
                        className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                      >
                        {step.action}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                  <step.icon className="mt-1 hidden h-4 w-4 shrink-0 text-muted-foreground/50 sm:block" />
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              What the statuses mean
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {STATUS_GUIDE.map((status) => (
                <div key={status.label} className="rounded-xl border border-border/70 p-3">
                  <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", status.className)}>
                    {status.label}
                  </span>
                  <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{status.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Common questions
            </p>
            <div className="divide-y rounded-xl border border-border/70">
              {FAQS.map((faq) => (
                <details key={faq.q} className="group px-3 py-2.5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
                    {faq.q}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{faq.a}</p>
                </details>
              ))}
            </div>
          </section>

          <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="text-[13px] leading-5">
              <p className="font-semibold">Still stuck?</p>
              <p className="text-muted-foreground">
                Contact your HR administrator with your staff ID. If you cannot sign in, ask them to reset your
                temporary password.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Location is only used to confirm your branch.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Tip: press Tab to move, Enter to select.
            </span>
          </div>

          <Link
            href={home}
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Take me to my dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function HelpButton({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-xs font-semibold text-muted-foreground shadow-[var(--elevation-1)] transition-colors hover:border-primary/30 hover:text-foreground",
          className
        )}
        aria-label="Open the help guide"
      >
        <HelpCircle className="h-4 w-4 text-primary" />
        <span className="hidden sm:inline">Help</span>
      </button>
      <HelpDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
