"use client"

import { useMemo, useState } from "react"

export function usePagination<T>(rows: T[], pageSize = 20) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * pageSize
  const visible = useMemo(() => rows.slice(start, start + pageSize), [rows, start, pageSize])

  return {
    page: currentPage,
    pageCount,
    visible,
    setPage,
    start,
    end: Math.min(start + pageSize, rows.length),
  }
}
