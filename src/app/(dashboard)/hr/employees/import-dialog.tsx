"use client"

import React, { useMemo, useRef, useState } from "react"
import * as XLSX from "xlsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Callout } from "@/components/ui/callout"
import { useToast } from "@/providers/toast-provider"
import { useBranches, useDepartments, useTeams, useSchedules } from "@/lib/queries"
import { downloadCSV } from "@/lib/export"
import {
  FileUp,
  FileDown,
  Upload,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react"

// ============================================================================
// Import employees — parse an xlsx/csv roster, preview every row, then create
// everything in one batch via POST /api/employees/import. Template + results
// CSV go through downloadCSV().
// ============================================================================

const MAX_ROWS = 200

const TEMPLATE_HEADERS = [
  "Full name",
  "Work email",
  "Phone",
  "Branch",
  "Department",
  "Team",
  "Job title",
  "Hire date",
  "Role",
  "Rank",
] as const

const ROLE_ALIASES: Record<string, string> = {
  staff: "employee",
  officer: "hr_officer",
  "hr officer": "hr_officer",
  "hr admin": "hr_admin",
  administrator: "hr_admin",
  manager: "branch_manager",
  "branch manager": "branch_manager",
}
const RANK_ALIASES: Record<string, string> = {
  "senior manager": "senior_manager",
  "temporary staff": "temporary_staff",
  executive: "director",
  head: "director",
}
const VALID_ROLES = ["super_admin", "hr_admin", "hr_officer", "branch_manager", "employee"]
const VALID_RANKS = ["ceo", "director", "senior_manager", "manager", "staff", "temporary_staff", "intern"]

interface ParsedRow {
  rowIndex: number
  full_name: string
  email: string
  phone: string
  branch: string
  department: string
  team: string
  job_title: string
  hire_date: string
  role: string
  rank: string
}

interface ServerResult {
  row: number
  name: string
  email: string
  status: "created" | "error"
  temp_password?: string
  employee_no?: string
  error?: string
}

function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[_*]/g, " ").replace(/\s+/g, " ").trim()
}

function toISODate(value: unknown, raw: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Accept DD/MM/YYYY and MM/DD/YYYY — prefer DD/MM for a Sierra Leone roster
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) {
    const [, a, b, y] = m
    const year = y.length === 2 ? `20${y}` : y
    const first = Number(a)
    const second = Number(b)
    // if the first part can only be a month, treat as MM/DD
    const [d, mo] = first > 12 ? [Number(b), Number(a)] : [first, second]
    return `${year}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }
  return s
}

function mapRow(record: Record<string, unknown>, index: number): ParsedRow {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const direct = record[key]
      if (direct !== undefined && String(direct).trim() !== "") return direct
    }
    return undefined
  }
  const hireRaw = get("hire date", "start date")
  return {
    rowIndex: index,
    full_name: String(get("full name", "name", "employee") ?? "").trim(),
    email: String(get("work email", "email", "email address") ?? "").trim(),
    phone: String(get("phone", "phone number", "mobile") ?? "").trim(),
    branch: String(get("branch", "branch name", "branch code") ?? "").trim(),
    department: String(get("department", "dept") ?? "").trim(),
    team: String(get("team") ?? "").trim(),
    job_title: String(get("job title", "title", "position") ?? "").trim(),
    hire_date: toISODate(hireRaw, String(hireRaw ?? "")),
    role: normaliseHeader(String(get("role", "user role") ?? "employee")),
    rank: normaliseHeader(String(get("rank", "employee rank") ?? "staff")),
  }
}

interface Validation {
  ok: boolean
  reason?: string
}

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const { error: toastError, success } = useToast()
  const branches = useBranches(true)
  const departments = useDepartments()
  const teams = useTeams()
  const schedules = useSchedules(true)

  const fileInput = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null)
  const [fileLabel, setFileLabel] = useState("")
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ServerResult[] | null>(null)
  const [summary, setSummary] = useState<{ created: number; failed: number } | null>(null)

  const branchList = useMemo(() => branches.data ?? [], [branches.data])
  const deptList = useMemo(() => departments.data ?? [], [departments.data])
  const teamList = useMemo(() => teams.data ?? [], [teams.data])
  const activeSchedules = useMemo(() => schedules.data ?? [], [schedules.data])

  const reset = () => {
    setParsed(null)
    setFileLabel("")
    setResults(null)
    setSummary(null)
    if (fileInput.current) fileInput.current.value = ""
  }

  const resolveBranch = (value: string) =>
    branchList.find(
      (b) => b.name.toLowerCase() === value.toLowerCase() || b.code.toLowerCase() === value.toLowerCase()
    )
  const resolveDept = (value: string) =>
    deptList.find((d) => (d.name).toLowerCase() === value.toLowerCase() || (d.code ?? "").toLowerCase() === value.toLowerCase())
  const resolveTeam = (value: string) => teamList.find((t) => (t.name).toLowerCase() === value.toLowerCase())
  const mapRole = (value: string) => ROLE_ALIASES[value] ?? value
  const mapRank = (value: string) => RANK_ALIASES[value] ?? value

  const validate = (rows: ParsedRow[]): (Validation & { payload?: Record<string, unknown> })[] => {
    const seen = new Map<string, number>()
    return rows.map((row) => {
      const fail = (reason: string): Validation => ({ ok: false, reason })
      if (!row.full_name) return fail("Full name is missing")
      if (!row.email) return fail("Work email is missing")
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return fail("Invalid work email")
      if (seen.has(row.email.toLowerCase())) {
        return fail(`Duplicate of row ${seen.get(row.email.toLowerCase())}`)
      }
      seen.set(row.email.toLowerCase(), row.rowIndex)
      const branch = resolveBranch(row.branch)
      if (!branch) return fail(`Branch "${row.branch || "?"}" not found`)
      if (row.department && !resolveDept(row.department)) return fail(`Department "${row.department}" not found`)
      if (row.team && !resolveTeam(row.team)) return fail(`Team "${row.team}" not found`)
      const role = mapRole(row.role || "employee")
      if (!VALID_ROLES.includes(role)) return fail(`Role "${row.role}" is unknown — use employee`)
      const rank = mapRank(row.rank || "staff")
      if (!VALID_RANKS.includes(rank)) return fail(`Rank "${row.rank}" is unknown — use staff`)

      return {
        ok: true,
        payload: {
          full_name: row.full_name,
          email: row.email,
          phone: row.phone || undefined,
          branch_id: branch.id,
          department_id: resolveDept(row.department)?.id,
          team_id: resolveTeam(row.team)?.id,
          job_title: row.job_title || undefined,
          hire_date: row.hire_date || undefined,
          role,
          rank,
          employment_status: "active",
        },
      }
    })
  }

  const parsedValidations = useMemo(() => (parsed ? validate(parsed) : []), [parsed, branchList, deptList, teamList])

  const handleFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
      const mapped = records
        .map(mapRow)
        .filter((row) => row.full_name || row.email) // skip stray empty rows
        .map((row, index) => ({ ...row, rowIndex: index + 2 }))
      if (mapped.length === 0) {
        toastError("Nothing to import", "No rows found below the header in the first sheet.")
        return
      }
      if (mapped.length > MAX_ROWS) {
        toastError("Too many rows", `Import is limited to ${MAX_ROWS} employees per batch — this file has ${mapped.length}.`)
        return
      }
      setFileLabel(`${file.name} — ${mapped.length} row${mapped.length === 1 ? "" : "s"}`)
      setResults(null)
      setSummary(null)
      setParsed(mapped)
    } catch {
      toastError("Could not read file", "Make sure it is a valid .xlsx or .csv file with one header row.")
    }
  }

  const submitImport = async () => {
    const valid = parsedValidations.filter((v) => v.ok && v.payload)
    if (valid.length === 0) {
      toastError("Nothing valid to import", "Fix the highlighted rows or remove them and try again.")
      return
    }
    setImporting(true)
    try {
      const res = await fetch("/api/employees/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: valid.map((v) => v.payload) }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        toastError("Import failed", data?.error ?? "Unexpected server error.")
        return
      }
      setResults(data.results ?? [])
      setSummary(data.summary ?? { created: 0, failed: 0 })
      onImported()
      if (data.summary?.created > 0) {
        success(
          "Employees imported",
          `${data.summary.created} account${data.summary.created === 1 ? "" : "s"} created — download the credentials below.`
        )
      }
    } catch {
      toastError("Import failed", "Network error — check your connection and try again.")
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    downloadCSV(`employee_import_template`, [
      Object.fromEntries(TEMPLATE_HEADERS.map((h) => [h, ""])),
      {
        "Full name": "Aminata Kamara",
        "Work email": "aminata.kamara@orangesl.demo",
        Phone: "+232 76 000000",
        Branch: "HQ",
        Department: "Operations",
        Team: "",
        "Job title": "Customer Service Officer",
        "Hire date": "2026-10-24",
        Role: "employee",
        Rank: "staff",
      },
    ])
  }

  const downloadCredentials = () => {
    if (!results) return
    downloadCSV(
      `new_employee_credentials_${new Date().toISOString().slice(0, 10)}`,
      results
        .filter((r) => r.status === "created")
        .map((r) => ({
          full_name: r.name,
          work_email: r.email,
          employee_no: r.employee_no ?? "",
          temp_password: r.temp_password ?? "",
          first_login: "must change password",
        }))
    )
  }

  const validCount = parsedValidations.filter((v) => v.ok).length
  const invalidRows = parsedValidations.map((v, i) => ({ v, row: parsed?.[i] })).filter(({ v }) => !v.ok)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import employees</DialogTitle>
          <DialogDescription>
            Upload an xlsx or csv roster. Employee numbers and schedules are assigned automatically — new staff get a
            temporary password and must change it at first login.
          </DialogDescription>
        </DialogHeader>

        {!parsed && !results && (
          <div className="space-y-4">
            <Callout variant="info" title="Columns we read">
              {TEMPLATE_HEADERS.join(" · ")}. Only Full name, Work email and Branch are required.
            </Callout>
            <div
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/25 bg-primary/5 p-8 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) void handleFile(file)
              }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <FileUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Drop the file here, or</p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" /> Choose .xlsx / .csv
                  </Button>
                  <Button size="sm" variant="ghost" onClick={downloadTemplate}>
                    <FileDown className="mr-2 h-4 w-4" /> Download template
                  </Button>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleFile(file)
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {parsed && !results && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{fileLabel}</span>
              <Badge variant={validCount === parsed.length ? "success" : "warning"}>
                {validCount}/{parsed.length} ready
              </Badge>
            </div>

            {invalidRows.length > 0 && (
              <Callout variant="warning" title={`${invalidRows.length} row${invalidRows.length === 1 ? "" : "s"} will be skipped`}>
                {invalidRows
                  .slice(0, 4)
                  .map(({ v, row }) => `Row ${row?.rowIndex}: ${v.reason}`)
                  .join(" · ")}
              </Callout>
            )}

            <div className="max-h-64 overflow-auto rounded-lg border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="sticky top-0 bg-muted/60 text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Email</th>
                    <th className="px-3 py-2 font-semibold">Branch → Dept</th>
                    <th className="px-3 py-2 font-semibold">Role</th>
                    <th className="px-3 py-2 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((row, i) => {
                    const v = parsedValidations[i]
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{row.rowIndex}</td>
                        <td className="px-3 py-2 font-medium">{row.full_name || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{row.email}</td>
                        <td className="px-3 py-2 text-[12px] text-muted-foreground">
                          {row.branch}
                          {row.department ? ` → ${row.department}` : ""}
                        </td>
                        <td className="px-3 py-2 text-[12px]">{mapRole(row.role || "employee")}</td>
                        <td className="px-3 py-2 text-right">
                          {v.ok ? (
                            <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" />
                          ) : (
                            <span title={v.reason} className="flex items-center justify-end gap-1.5">
                              <XCircle className="h-4 w-4 text-red-500" />
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {results && summary && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> {summary.created} created
              </Badge>
              {summary.failed > 0 && (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> {summary.failed} failed
                </Badge>
              )}
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="sticky top-0 bg-muted/60 text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Employee</th>
                    <th className="px-3 py-2 font-semibold">Email</th>
                    <th className="px-3 py-2 font-semibold">Temp password</th>
                    <th className="px-3 py-2 text-right font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">
                        {r.name || `Row ${r.row}`}
                        {r.employee_no && (
                          <span className="ml-2 font-mono text-[10.5px] text-muted-foreground">{r.employee_no}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">{r.email}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{r.temp_password ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-[12px]">
                        {r.status === "created" ? (
                          <span className="text-emerald-600">Created</span>
                        ) : (
                          <span title={r.error} className="text-red-500">
                            {r.error ?? "Failed"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {summary.created > 0 && (
              <Callout variant="info" title="Share credentials securely">
                Download the list, send each person their temporary password, and hand out the browser link. First
                login forces a password change.
              </Callout>
            )}
          </div>
        )}

        <DialogFooter>
          {results ? (
            <>
              <Button variant="outline" onClick={downloadCredentials} disabled={!results.some((r) => r.status === "created")}>
                <FileDown className="mr-2 h-4 w-4" /> Download credentials CSV
              </Button>
              <Button onClick={() => { reset(); onOpenChange(false) }}>Done</Button>
            </>
          ) : parsed ? (
            <>
              <Button variant="outline" onClick={reset} disabled={importing}>
                Back
              </Button>
              <Button onClick={submitImport} disabled={importing || validCount === 0}>
                <Users className="mr-2 h-4 w-4" />
                {importing ? "Importing…" : `Import ${validCount} employee${validCount === 1 ? "" : "s"}`}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
