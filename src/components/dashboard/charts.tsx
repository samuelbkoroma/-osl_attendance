"use client"

import React, { useMemo } from "react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Dependency-free charts (pure SVG) styled to the Orange SL brand tokens.
// ---------------------------------------------------------------------------

export interface ChartSegment {
  label: string
  value: number
  color: string
}

/** Donut with a centered total. Used for the present/late/absent split. */
export function DonutChart({
  segments,
  size = 168,
  thickness = 22,
  centerLabel,
  centerValue,
  className,
}: {
  segments: ChartSegment[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string | number
  className?: string
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius

  const arcs = segments
    .filter((s) => s.value > 0)
    .reduce<{ label: string; value: number; color: string; dash: number; offset: number }[]>(
      (acc, s) => {
        const fraction = total > 0 ? s.value / total : 0
        const dash = fraction * circumference
        const offset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0
        acc.push({ ...s, dash, offset })
        return acc
      },
      []
    )

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-muted"
        />
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={a.color}
            strokeWidth={thickness}
            strokeDasharray={`${a.dash} ${circumference - a.dash}`}
            strokeDashoffset={-a.offset}
            strokeLinecap="butt"
          >
            <title>{`${a.label}: ${a.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{centerValue ?? total}</span>
        {centerLabel && (
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {centerLabel}
          </span>
        )}
      </div>
    </div>
  )
}

/** Horizontal ranked bars — good for per-branch comparison. */
export function BarList({
  items,
  valueFormatter,
  className,
}: {
  items: ChartSegment[]
  valueFormatter?: (value: number) => string
  className?: string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className={cn("space-y-3", className)}>
      {items.map((item, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate font-medium">{item.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {valueFormatter ? valueFormatter(item.value) : item.value}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(item.value / max) * 100}%`, backgroundColor: item.color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export interface TrendPoint {
  label: string
  value: number
}

/** Area/line trend with subtle gradient fill. Used for the 7/30-day rate. */
export function TrendChart({
  points,
  height = 160,
  color = "#ff7900",
  valueSuffix = "",
  className,
}: {
  points: TrendPoint[]
  height?: number
  color?: string
  valueSuffix?: string
  className?: string
}) {
  const width = 640
  const padding = { top: 16, right: 12, bottom: 26, left: 12 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  const { path, area, coords, max } = useMemo(() => {
    const max = Math.max(1, ...points.map((p) => p.value))
    const step = points.length > 1 ? innerW / (points.length - 1) : 0
    const coords = points.map((p, i) => {
      const x = padding.left + i * step
      const y = padding.top + innerH - (p.value / max) * innerH
      return { x, y, ...p }
    })
    const path = coords
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(" ")
    const baseY = padding.top + innerH
    const area =
      coords.length > 0
        ? `${path} L ${coords[coords.length - 1].x.toFixed(1)} ${baseY} L ${coords[0].x.toFixed(1)} ${baseY} Z`
        : ""
    return { path, area, coords, max }
  }, [points, innerW, innerH, padding.left, padding.top])

  if (points.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center text-sm text-muted-foreground", className)}
        style={{ height }}
      >
        No data yet
      </div>
    )
  }

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`trend-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={area} fill={`url(#trend-${color.replace("#", "")})`} />}
        <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={3} fill={color}>
            <title>{`${c.label}: ${c.value}${valueSuffix}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{points[0]?.label}</span>
        <span>peak {max}{valueSuffix}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  )
}

/** Compact inline values for a StatCard-style tile. */
export function MiniTrend({
  values,
  color = "#ff7900",
  className,
}: {
  values: number[]
  color?: string
  className?: string
}) {
  const width = 120
  const height = 32
  if (values.length === 0) return null
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? width / (values.length - 1) : 0
  const path = values
    .map((v, i) => {
      const x = i * step
      const y = height - (v / max) * (height - 4) - 2
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className}>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
