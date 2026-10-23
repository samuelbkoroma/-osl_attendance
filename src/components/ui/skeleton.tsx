import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer animate-pulse rounded-xl bg-muted", className)}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }
