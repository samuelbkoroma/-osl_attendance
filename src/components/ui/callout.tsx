import * as React from "react"
import { AlertTriangle, CheckCircle2, Info, Lightbulb } from "lucide-react"
import { cn } from "@/lib/utils"

type CalloutVariant = "info" | "tip" | "warning" | "success"

const styles: Record<CalloutVariant, { wrap: string; icon: string; Icon: React.ElementType }> = {
  info: {
    wrap: "border-blue-500/20 bg-blue-500/[0.06] text-blue-950",
    icon: "bg-blue-500/10 text-blue-600",
    Icon: Info,
  },
  tip: {
    wrap: "border-primary/20 bg-primary/[0.05] text-foreground",
    icon: "bg-primary/10 text-primary",
    Icon: Lightbulb,
  },
  warning: {
    wrap: "border-amber-500/25 bg-amber-500/[0.07] text-amber-950",
    icon: "bg-amber-500/15 text-amber-600",
    Icon: AlertTriangle,
  },
  success: {
    wrap: "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-950",
    icon: "bg-emerald-500/10 text-emerald-600",
    Icon: CheckCircle2,
  },
}

interface CalloutProps {
  variant?: CalloutVariant
  title?: string
  icon?: React.ElementType
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function Callout({ variant = "tip", title, icon, children, action, className }: CalloutProps) {
  const style = styles[variant]
  const Icon = icon ?? style.Icon
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-3.5 sm:p-4", style.wrap, className)}>
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", style.icon)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="text-sm font-semibold leading-5">{title}</p>}
        {children && <div className="text-[13px] leading-5 text-muted-foreground">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  )
}
