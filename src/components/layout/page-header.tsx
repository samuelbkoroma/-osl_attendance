import React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  icon?: React.ElementType
  backHref?: string
  backLabel?: string
  children?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  backHref,
  backLabel = "Back",
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-primary/8 to-transparent text-primary ring-1 ring-primary/15 sm:flex">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 space-y-1">
          {backHref && (
            <Link
              href={backHref}
              className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
          )}
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
          )}
          <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight sm:text-2xl lg:text-[28px]">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-[13px] leading-5 text-muted-foreground sm:text-sm">{description}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{children}</div>
      )}
    </div>
  )
}
