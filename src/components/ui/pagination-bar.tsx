"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PaginationBar({
  page,
  pageCount,
  total,
  start,
  end,
  onPageChange,
  label = "items",
}: {
  page: number
  pageCount: number
  total: number
  start: number
  end: number
  onPageChange: (page: number) => void
  label?: string
}) {
  if (total === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <p className="text-[11.5px] text-muted-foreground">
        Showing <span className="font-medium text-foreground">{start + 1}–{end}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span> {label}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="mr-1 h-3.5 w-3.5" />
          Previous
        </Button>
        <span className="px-1 text-[11.5px] tabular-nums text-muted-foreground">
          {page} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
