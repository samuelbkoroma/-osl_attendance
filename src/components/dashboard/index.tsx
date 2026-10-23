"use client"

import React from "react"
import Link from "next/link"
import { ArrowRight, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import type { AttendanceStatus, CutoffStatus, Employee } from "@/types"
import { getInitials } from "@/lib/utils"
import { STATUS_LABELS, statusStyles, cutoffLabel, cutoffStyles } from "@/lib/attendance"

const statVariants = {
  default: {
    iconBg: "from-primary/12 to-primary/5",
    iconText: "text-primary",
    accent: "from-primary/60",
  },
  primary: {
    iconBg: "from-primary/12 to-primary/5",
    iconText: "text-primary",
    accent: "from-primary/60",
  },
  success: {
    iconBg: "from-emerald-500/12 to-emerald-500/5",
    iconText: "text-emerald-600",
    accent: "from-emerald-500/70",
  },
  warning: {
    iconBg: "from-amber-500/14 to-amber-500/5",
    iconText: "text-amber-600",
    accent: "from-amber-500/70",
  },
  destructive: {
    iconBg: "from-red-500/12 to-red-500/5",
    iconText: "text-red-600",
    accent: "from-red-500/70",
  },
  info: {
    iconBg: "from-blue-500/12 to-blue-500/5",
    iconText: "text-blue-600",
    accent: "from-blue-500/70",
  },
} as const

export type StatCardVariant = keyof typeof statVariants

interface StatCardProps {
  title: string
  value: string | number
  description?: string
  icon?: React.ElementType
  variant?: StatCardVariant
  className?: string
  href?: string
}

export function StatCard({ title, value, description, icon: Icon, variant = "default", className, href }: StatCardProps) {
  const colors = statVariants[variant]
  const content = (
    <Card
      interactive={!!href}
      className={cn("group relative h-full overflow-hidden", className)}
    >
      <div className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent opacity-60", colors.accent)} />
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
          {description && <p className="text-xs leading-4 text-muted-foreground">{description}</p>}
        </div>
        {Icon && (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-border/50 transition-transform group-hover:scale-105", colors.iconBg)}>
            <Icon className={cn("h-[18px] w-[18px]", colors.iconText)} />
          </div>
        )}
      </CardContent>
    </Card>
  )
  if (href) {
    return (
      <Link href={href} className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {content}
      </Link>
    )
  }
  return content
}

interface MetricCardProps {
  label: string
  value: string | number
  icon?: React.ElementType
  variant?: StatCardVariant
  valueClass?: string
  className?: string
}

export function MetricCard({ label, value, icon: Icon, variant = "default", valueClass, className }: MetricCardProps) {
  const colors = statVariants[variant]
  return (
    <Card className={cn("group transition-all hover:shadow-[var(--elevation-2)]", className)}>
      <CardContent className="flex items-center gap-3 p-4">
        {Icon && (
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-border/50",
            colors.iconBg
          )}>
            <Icon className={cn("h-5 w-5", colors.iconText)} />
          </div>
        )}
        <div className="min-w-0">
          <p className={cn("truncate text-xl font-bold tracking-tight tabular-nums", valueClass)}>{value}</p>
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function StatusBadge({ status, className }: { status: AttendanceStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(statusStyles(status), "font-semibold", className)}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

export function CutoffBadge({ cutoff, className }: { cutoff: CutoffStatus | null; className?: string }) {
  return (
    <Badge variant="outline" className={cn(cutoffStyles(cutoff), "font-semibold", className)}>
      {cutoffLabel(cutoff)}
    </Badge>
  )
}

interface EmployeeRowProps {
  employee: Employee
  rightContent?: React.ReactNode
  onClick?: () => void
}

export function EmployeeRow({ employee, rightContent, onClick }: EmployeeRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b px-4 py-3 transition-colors last:border-b-0",
        onClick && "cursor-pointer hover:bg-accent/50"
      )}
      onClick={onClick}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-9 w-9 ring-2 ring-primary/10">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {getInitials(employee.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{employee.full_name}</p>
          <p className="font-mono text-xs text-muted-foreground">{employee.employee_no}</p>
        </div>
      </div>
      {rightContent}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: React.ElementType
  title: string
  description: string
  action?: React.ReactNode
  compact?: boolean
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-14")}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/40 ring-1 ring-border">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-5 text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

interface SectionHeadingProps {
  title: string
  description?: string
  icon?: React.ElementType
  action?: React.ReactNode
  className?: string
}

export function SectionHeading({ title, description, icon: Icon, action, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="flex items-start gap-2.5">
        {Icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div>
          <h2 className="text-[15px] font-bold tracking-tight sm:text-base">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

interface ActionTileProps {
  href: string
  title: string
  description: string
  icon: React.ElementType
  accent?: "orange" | "blue" | "green" | "purple"
  badge?: string | number
}

const actionAccents = {
  orange: "bg-primary/10 text-primary ring-primary/15",
  blue: "bg-blue-500/10 text-blue-600 ring-blue-500/15",
  green: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/15",
  purple: "bg-purple-500/10 text-purple-600 ring-purple-500/15",
}

export function ActionTile({ href, title, description, icon: Icon, accent = "orange", badge }: ActionTileProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-[var(--elevation-1)] transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[var(--elevation-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1", actionAccents[accent])}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{title}</span>
          {badge !== undefined && badge !== 0 && (
            <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
              {badge}
            </Badge>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  )
}

interface GuideStep {
  title: string
  body: string
}

export function GuideCard({
  title,
  description,
  steps,
  action,
  className,
}: {
  title: string
  description?: string
  steps: GuideStep[]
  action?: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="border-b border-border/60 bg-gradient-to-r from-primary/[0.06] to-transparent p-4 sm:p-5">
        <h3 className="text-sm font-bold">{title}</h3>
        {description && <p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">{description}</p>}
      </div>
      <CardContent className="space-y-3 p-4 sm:p-5">
        {steps.map((step, i) => (
          <div key={step.title} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-5">{step.title}</p>
              <p className="text-[12px] leading-5 text-muted-foreground">{step.body}</p>
            </div>
          </div>
        ))}
        {action && <div className="pt-1">{action}</div>}
      </CardContent>
    </Card>
  )
}

export function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  )
}

export { DonutChart, BarList, TrendChart, MiniTrend } from "./charts"
export type { ChartSegment, TrendPoint } from "./charts"
