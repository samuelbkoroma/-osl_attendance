"use client"

import React, { useMemo, useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState, StatCard, SectionHeading } from "@/components/dashboard"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Callout } from "@/components/ui/callout"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/providers/toast-provider"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { usePagination } from "@/lib/use-pagination"
import {
  useEmployees,
  useBranches,
  useDepartments,
  useTeams,
  useSchedules,
  useCreateEmployee,
  useUpdateEmployee,
  useEmployeeAdminAction,
} from "@/lib/queries"
import type { Employee, EmployeeRank, EmploymentStatus, IssuedEmployee, UserRole } from "@/types"
import {
  getEmploymentStatusLabel,
  getEmploymentStatusStyles,
  getRoleLabel,
  getRankLabel,
  getRankStyles,
  getEmploymentCategoryLabel,
  getEmploymentCategoryStyles,
  getInitials,
  cn,
} from "@/lib/utils"
import { canManageSettings } from "@/lib/navigation"
import { useAuth } from "@/providers/auth-provider"
import { downloadCSV } from "@/lib/export"
import { freeTownDate } from "@/lib/attendance"
import {
  Users,
  Plus,
  Search,
  KeyRound,
  ShieldCheck,
  UserCheck,
  UserX,
  Copy,
  Check,
  FileDown,
  FilterX,
  Mail,
  Phone,
  Briefcase,
  Building2,
  CalendarDays,
  UserCog,
} from "lucide-react"

const STATUS_OPTIONS: EmploymentStatus[] = ["active", "inactive", "on_leave", "terminated"]
const ROLE_OPTIONS: UserRole[] = ["employee", "branch_manager", "hr_officer", "hr_admin", "super_admin"]
const RANK_OPTIONS: EmployeeRank[] = [
  "ceo",
  "director",
  "senior_manager",
  "manager",
  "staff",
  "temporary_staff",
  "intern",
]

export default function HrEmployeesPage() {
  const { user } = useAuth()
  const { error: toastError, success, warning } = useToast()
  const isAdmin = canManageSettings(user?.role)

  const [search, setSearch] = useState("")
  const [branchId, setBranchId] = useState("all")
  const [status, setStatus] = useState<EmploymentStatus | "all">("all")
  const [rankFilter, setRankFilter] = useState<EmployeeRank | "all">("all")

  const employees = useEmployees({
    query: search.trim() || undefined,
    branchId: branchId === "all" ? undefined : branchId,
    status,
    rank: rankFilter,
  })
  const branches = useBranches(true)
  const schedules = useSchedules(true)

  const [addOpen, setAddOpen] = useState(false)
  const [detail, setDetail] = useState<Employee | null>(null)
  const [credentials, setCredentials] = useState<IssuedEmployee | null>(null)

  // Add-employee form
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [newBranchId, setNewBranchId] = useState("")
  const [departmentId, setDepartmentId] = useState("")
  const [teamId, setTeamId] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [scheduleId, setScheduleId] = useState("")
  const [hireDate, setHireDate] = useState("")
  const [role, setRole] = useState<UserRole>("employee")
  const [rank, setRank] = useState<EmployeeRank>("staff")
  const [managerId, setManagerId] = useState("")

  const departments = useDepartments(newBranchId || undefined)
  const teams = useTeams(departmentId || undefined)
  const managers = useEmployees({ status: "active" })
  const createEmployee = useCreateEmployee()
  const updateEmployee = useUpdateEmployee()
  const adminAction = useEmployeeAdminAction()

  const rows = useMemo(() => employees.data ?? [], [employees.data])
  const pager = usePagination(rows, 20)

  const counts = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((e) => e.employment_status === "active").length,
      onLeave: rows.filter((e) => e.employment_status === "on_leave").length,
      inactive: rows.filter(
        (e) => e.employment_status === "inactive" || e.employment_status === "terminated"
      ).length,
    }),
    [rows]
  )

  const hasFilters =
    !!search.trim() || branchId !== "all" || status !== "all" || rankFilter !== "all"

  const resetFilters = () => {
    setSearch("")
    setBranchId("all")
    setStatus("all")
    setRankFilter("all")
    pager.setPage(1)
  }

  const resetAddForm = () => {
    setFullName("")
    setEmail("")
    setPhone("")
    setNewBranchId("")
    setDepartmentId("")
    setTeamId("")
    setJobTitle("")
    setScheduleId("")
    setHireDate("")
    setRole("employee")
    setRank("staff")
    setManagerId("")
  }

  const submitNew = () => {
    if (!fullName.trim() || !email.trim() || !newBranchId || !scheduleId) {
      toastError("Missing details", "Name, email, branch and schedule are required.")
      return
    }
    createEmployee.mutate(
      {
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        branch_id: newBranchId,
        department_id: departmentId || undefined,
        team_id: teamId || undefined,
        job_title: jobTitle.trim() || undefined,
        schedule_id: scheduleId,
        hire_date: hireDate || undefined,
        role,
        rank,
        manager_id: managerId || null,
      },
      {
        onSuccess: (res) => {
          success("Employee created", "Share their sign-in details from the next screen.")
          setAddOpen(false)
          resetAddForm()
          setCredentials(res)
        },
        onError: (err) => toastError("Creation failed", err.message),
      }
    )
  }

  const saveStatus = (employee: Employee, employment_status: EmploymentStatus) => {
    setDetail((d) => (d && d.id === employee.id ? { ...d, employment_status } : d))
    updateEmployee.mutate(
      { id: employee.id, patch: { employment_status } },
      {
        onSuccess: () =>
          success(
            "Status updated",
            employment_status === "terminated"
              ? `${employee.full_name}'s sign-in was disabled and pending requests were closed.`
              : `${employee.full_name} is now ${getEmploymentStatusLabel(employment_status)}.`
          ),
        onError: (err) => {
          setDetail((d) => (d && d.id === employee.id ? { ...d, employment_status: employee.employment_status } : d))
          toastError("Update failed", err.message)
        },
      }
    )
  }

  const saveRank = (employee: Employee, nextRank: EmployeeRank) => {
    setDetail((d) => (d && d.id === employee.id ? { ...d, rank: nextRank } : d))
    updateEmployee.mutate(
      { id: employee.id, patch: { rank: nextRank } },
      {
        onSuccess: () => success("Rank updated", `${employee.full_name} is now ${getRankLabel(nextRank)}.`),
        onError: (err) => {
          setDetail((d) => (d && d.id === employee.id ? { ...d, rank: employee.rank } : d))
          toastError("Update failed", err.message)
        },
      }
    )
  }

  const resetPassword = () => {
    if (!detail?.user_id) return
    adminAction.mutate(
      { action: "reset_password", employeeId: detail.id },
      {
        onSuccess: (res) => setCredentials({ ...detail, tempPassword: res.tempPassword }),
        onError: (err) => toastError("Reset failed", err.message),
      }
    )
  }

  const changeRole = (nextRole: UserRole) => {
    if (!detail?.user_id) return
    adminAction.mutate(
      { action: "set_role", userId: detail.user_id, role: nextRole },
      {
        onSuccess: () => {
          success("Role updated", `${detail.full_name} is now ${getRoleLabel(nextRole)}.`)
          setDetail((d) =>
            d ? { ...d, profile: { ...(d.profile ?? ({ role: nextRole } as never)), role: nextRole } } : d
          )
        },
        onError: (err) => toastError("Role change failed", err.message),
      }
    )
  }

  const toggleActive = () => {
    if (!detail?.user_id) return
    const isActive = detail.profile ? !detail.profile.is_active : true
    adminAction.mutate(
      { action: "set_profile_active", userId: detail.user_id, isActive },
      {
        onSuccess: () => {
          if (isActive) success("Account activated", `${detail.full_name} can sign in again.`)
          else warning("Account deactivated", `${detail.full_name} can no longer sign in.`)
          setDetail(null)
        },
        onError: (err) => toastError("Action failed", err.message),
      }
    )
  }

  const detailProfileActive = detail?.profile?.is_active ?? true
  const detailRole = detail?.profile?.role ?? "employee"

  return (
    <DashboardLayout title="Employees">
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          title="Employees"
          description="Manage worker records, accounts, roles and passwords"
          icon={Users}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCSV(
                `employees_${freeTownDate()}`,
                rows.map((e) => ({
                  employee_no: e.employee_no,
                  full_name: e.full_name,
                  work_email: e.work_email ?? "",
                  job_title: e.job_title ?? "",
                  rank: getRankLabel(e.rank),
                  category: getEmploymentCategoryLabel(e.employment_category),
                  status: getEmploymentStatusLabel(e.employment_status),
                  branch: e.branch?.name ?? "",
                  manager: e.manager?.full_name ?? "",
                  phone: e.phone ?? "",
                  hire_date: e.hire_date ?? "",
                }))
              )
            }
            disabled={rows.length === 0}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => {
                resetAddForm()
                setAddOpen(true)
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add employee
            </Button>
          )}
        </PageHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="In view" value={counts.total} description="matching your filters" icon={Users} />
          <StatCard
            title="Active"
            value={counts.active}
            description="currently employed"
            icon={UserCheck}
            variant="success"
          />
          <StatCard
            title="On leave"
            value={counts.onLeave}
            description="away right now"
            icon={CalendarDays}
            variant="warning"
          />
          <StatCard
            title="Inactive / terminated"
            value={counts.inactive}
            description="no active record"
            icon={UserX}
            variant="destructive"
          />
        </div>

        <Card>
          <CardHeader className="gap-3 pb-3">
            <SectionHeading
              title="Employee directory"
              description="Search and filter to find anyone quickly"
              icon={Search}
              action={
                hasFilters ? (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>
                    <FilterX className="mr-1.5 h-3.5 w-3.5" />
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    pager.setPage(1)
                  }}
                  placeholder="Name, email, job title…"
                  className="h-9 pl-9"
                />
              </div>
              <Select
                value={branchId}
                onValueChange={(v) => {
                  setBranchId(v)
                  pager.setPage(1)
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {(branches.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={rankFilter}
                onValueChange={(v) => {
                  setRankFilter(v as EmployeeRank | "all")
                  pager.setPage(1)
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Rank" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ranks</SelectItem>
                  {RANK_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {getRankLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v as EmploymentStatus | "all")
                  pager.setPage(1)
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {getEmploymentStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {employees.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : employees.isError ? (
              <EmptyState
                icon={Users}
                title="Could not load employees"
                description={employees.error instanceof Error ? employees.error.message : "Try again shortly."}
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title={hasFilters ? "No employees match" : "No employees yet"}
                description={
                  hasFilters
                    ? "Try a different search, branch, rank or status."
                    : "Add your first employee to create their staff record and sign-in account."
                }
                action={
                  hasFilters ? (
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Clear filters
                    </Button>
                  ) : isAdmin ? (
                    <Button size="sm" onClick={() => { resetAddForm(); setAddOpen(true) }}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add employee
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                        <th className="py-2.5 pr-4 font-semibold">Employee</th>
                        <th className="py-2.5 pr-4 font-semibold">Branch</th>
                        <th className="py-2.5 pr-4 font-semibold">Job title</th>
                        <th className="py-2.5 pr-4 font-semibold">Rank</th>
                        <th className="py-2.5 pr-4 font-semibold">Schedule</th>
                        <th className="py-2.5 pr-4 font-semibold">Status</th>
                        <th className="py-2.5 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pager.visible.map((emp) => (
                        <tr key={emp.id} className="border-b transition-colors last:border-0 hover:bg-accent/40">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8 ring-2 ring-primary/10">
                                <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                                  {getInitials(emp.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="font-medium leading-tight">{emp.full_name}</div>
                                <div className="truncate font-mono text-[11px] text-muted-foreground">
                                  {emp.employee_no}
                                  {emp.work_email ? ` · ${emp.work_email}` : ""}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-[12.5px] text-muted-foreground">
                            {emp.branch?.name ?? "—"}
                          </td>
                          <td className="py-3 pr-4 text-[12.5px]">{emp.job_title ?? "—"}</td>
                          <td className="py-3 pr-4">
                            <Badge variant="outline" className={getRankStyles(emp.rank)}>
                              {getRankLabel(emp.rank)}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4 text-[12px] text-muted-foreground">
                            {emp.schedule?.name ?? "—"}
                          </td>
                          <td className="py-3 pr-4">
                            <Badge variant="outline" className={getEmploymentStatusStyles(emp.employment_status)}>
                              {getEmploymentStatusLabel(emp.employment_status)}
                            </Badge>
                          </td>
                          <td className="py-3 text-right">
                            <Button variant="ghost" size="sm" className="h-8" onClick={() => setDetail(emp)}>
                              Manage
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 md:hidden">
                  {pager.visible.map((emp) => (
                    <div key={emp.id} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar className="h-9 w-9 ring-2 ring-primary/10">
                            <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                              {getInitials(emp.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold">{emp.full_name}</p>
                            <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                              {emp.employee_no}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className={getEmploymentStatusStyles(emp.employment_status)}>
                          {getEmploymentStatusLabel(emp.employment_status)}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className={getRankStyles(emp.rank)}>
                          {getRankLabel(emp.rank)}
                        </Badge>
                        {emp.branch?.name && (
                          <Badge variant="outline" className="gap-1 font-normal">
                            <Building2 className="h-3 w-3" />
                            {emp.branch.name}
                          </Badge>
                        )}
                        {emp.job_title && (
                          <Badge variant="outline" className="gap-1 font-normal">
                            <Briefcase className="h-3 w-3" />
                            {emp.job_title}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-[10.5px] text-muted-foreground">
                          {emp.schedule?.name ?? "No schedule"}
                        </span>
                        <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setDetail(emp)}>
                          Manage
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  <PaginationBar
                    page={pager.page}
                    pageCount={pager.pageCount}
                    total={rows.length}
                    start={pager.start}
                    end={pager.end}
                    onPageChange={pager.setPage}
                    label="employees"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add employee */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>
              Creates the staff record and sign-in account. A temporary password will be shown once.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
            <div className="space-y-3">
              <SectionHeading title="Personal details" icon={Users} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full name <span className="text-destructive">*</span></Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Aminata Kamara" />
                </div>
                <div className="space-y-2">
                  <Label>Work email <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@orangesl.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+232 …" />
                </div>
                <div className="space-y-2">
                  <Label>Job title</Label>
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Sales Agent" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <SectionHeading
                title="Placement"
                description="Where they work and who they report to"
                icon={Building2}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Branch <span className="text-destructive">*</span></Label>
                  <Select
                    value={newBranchId}
                    onValueChange={(v) => {
                      setNewBranchId(v)
                      setDepartmentId("")
                      setTeamId("")
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {(branches.data ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select
                    value={departmentId}
                    onValueChange={(v) => {
                      setDepartmentId(v)
                      setTeamId("")
                    }}
                    disabled={!newBranchId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={newBranchId ? "Select department" : "Choose a branch first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(departments.data ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Team</Label>
                  <Select value={teamId} onValueChange={setTeamId} disabled={!departmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder={departmentId ? "Select team" : "Choose a department first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(teams.data ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Work schedule <span className="text-destructive">*</span></Label>
                  <Select value={scheduleId} onValueChange={setScheduleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      {(schedules.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hire date</Label>
                  <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Line manager</Label>
                  <Select value={managerId} onValueChange={setManagerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="No line manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {(managers.data ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.full_name} — {getRankLabel(m.rank)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <SectionHeading
                title="Access"
                description="Rank and system role control what they can see"
                icon={ShieldCheck}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Rank</Label>
                  <Select value={rank} onValueChange={(v) => setRank(v as EmployeeRank)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RANK_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {getRankLabel(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>System role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {getRoleLabel(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Callout variant="info">
                A sign-in account is created automatically. The employee uses their staff ID or work email with the
                temporary password, then sets their own password.
              </Callout>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitNew} disabled={createEmployee.isPending}>
              {createEmployee.isPending ? "Creating…" : "Create employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign-in credentials to hand to the employee */}
      <Dialog open={!!credentials} onOpenChange={(open) => !open && setCredentials(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign-in details for {credentials?.full_name}</DialogTitle>
            <DialogDescription>
              Give these to the employee. They sign in with the staff ID or work email, then set their own password.
            </DialogDescription>
          </DialogHeader>
          {credentials && (
            <CredentialsCard
              employeeNo={credentials.employee_no}
              email={credentials.work_email ?? ""}
              password={credentials.tempPassword ?? ""}
            />
          )}
          <DialogFooter>
            <Button onClick={() => setCredentials(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Employee detail / manage */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage employee</DialogTitle>
            <DialogDescription>Update their record, role or sign-in access.</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="max-h-[68vh] space-y-4 overflow-y-auto pr-1">
              <div className="flex items-start gap-3 rounded-xl border bg-gradient-to-br from-primary/[0.07] to-transparent p-3.5">
                <Avatar className="h-11 w-11 ring-2 ring-primary/15">
                  <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                    {getInitials(detail.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{detail.full_name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{detail.employee_no}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={getRankStyles(detail.rank)}>
                      {getRankLabel(detail.rank)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={getEmploymentStatusStyles(detail.employment_status)}
                    >
                      {getEmploymentStatusLabel(detail.employment_status)}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[13px]">
                {[
                  { label: "Branch", value: detail.branch?.name ?? "—", icon: Building2 },
                  { label: "Department", value: detail.department?.name ?? "—", icon: Users },
                  { label: "Schedule", value: detail.schedule?.name ?? "—", icon: CalendarDays },
                  { label: "Manager", value: detail.manager?.full_name ?? "—", icon: UserCog },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border p-2.5">
                    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <item.icon className="h-3 w-3" />
                      {item.label}
                    </p>
                    <p className="mt-1 truncate font-medium">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2.5 rounded-xl border p-3.5">
                <SectionHeading title="Employment" icon={Briefcase} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    {isAdmin ? (
                      <Select
                        value={detail.employment_status}
                        onValueChange={(v) => saveStatus(detail, v as EmploymentStatus)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {getEmploymentStatusLabel(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm font-medium">
                        {getEmploymentStatusLabel(detail.employment_status)}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Rank</Label>
                    {isAdmin ? (
                      <Select value={detail.rank} onValueChange={(v) => saveRank(detail, v as EmployeeRank)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RANK_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {getRankLabel(r)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm font-medium">{getRankLabel(detail.rank)}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Badge
                    variant="outline"
                    className={getEmploymentCategoryStyles(detail.employment_category)}
                  >
                    {getEmploymentCategoryLabel(detail.employment_category)}
                  </Badge>
                  {detail.managed_by_company && (
                    <span className="text-[11.5px] text-muted-foreground">
                      managed by {detail.managed_by_company}
                    </span>
                  )}
                </div>
              </div>

              <PlacementEditor
                key={detail.id}
                employee={detail}
                onUpdated={setDetail}
                canEdit={isAdmin}
              />

              {isAdmin && detail.user_id ? (
                <div className="space-y-3 rounded-xl border p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <SectionHeading
                      title="Sign-in account"
                      description={detail.work_email ?? detail.employee_no}
                      icon={ShieldCheck}
                    />
                    <Badge
                      variant="outline"
                      className={cn(
                        detailProfileActive
                          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {detailProfileActive ? "Active" : "Disabled"}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <Label>System role</Label>
                    <Select value={detailRole} onValueChange={(v) => changeRole(v as UserRole)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {getRoleLabel(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={resetPassword} disabled={adminAction.isPending}>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Reset password
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCredentials({ ...detail, tempPassword: undefined })}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Show details
                    </Button>
                    <Button
                      variant={detailProfileActive ? "destructive" : "default"}
                      size="sm"
                      onClick={toggleActive}
                      disabled={adminAction.isPending || detail.user_id === user?.id}
                    >
                      {detailProfileActive ? (
                        <>
                          <UserX className="mr-2 h-4 w-4" />
                          Disable sign-in
                        </>
                      ) : (
                        <>
                          <UserCheck className="mr-2 h-4 w-4" />
                          Enable sign-in
                        </>
                      )}
                    </Button>
                  </div>
                  {detail.user_id === user?.id && (
                    <p className="text-[11px] text-muted-foreground">
                      You cannot disable your own sign-in from here.
                    </p>
                  )}
                </div>
              ) : (
                <Callout variant="info">
                  This employee does not have a sign-in account, or you do not have permission to manage accounts.
                </Callout>
              )}

              {detail.work_email || detail.phone ? (
                <div className="space-y-1 text-[11.5px] text-muted-foreground">
                  {detail.work_email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3" /> {detail.work_email}
                    </p>
                  )}
                  {detail.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3" /> {detail.phone}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}

function PlacementEditor({
  employee,
  onUpdated,
  canEdit = true,
}: {
  employee: Employee
  onUpdated: (employee: Employee) => void
  canEdit?: boolean
}) {
  const { success, error: toastError } = useToast()
  const update = useUpdateEmployee()
  const branches = useBranches()
  const schedules = useSchedules()
  const managers = useEmployees({ status: "active" })

  const [branchId, setBranchId] = useState(employee.branch_id)
  const [departmentId, setDepartmentId] = useState(employee.department_id ?? "")
  const [teamId, setTeamId] = useState(employee.team_id ?? "")
  const [scheduleId, setScheduleId] = useState(employee.schedule_id)
  const [managerId, setManagerId] = useState(employee.manager_id ?? "")
  const [jobTitle, setJobTitle] = useState(employee.job_title ?? "")
  const [phone, setPhone] = useState(employee.phone ?? "")
  const [hireDate, setHireDate] = useState(employee.hire_date?.slice(0, 10) ?? "")

  const departments = useDepartments(branchId || undefined)
  const teams = useTeams(departmentId || undefined)

  const save = () => {
    if (!branchId || !scheduleId) {
      toastError("Missing details", "Branch and schedule are required.")
      return
    }
    const department = departments.data?.find((d) => d.id === departmentId) ?? null
    const team = teams.data?.find((t) => t.id === teamId) ?? null
    const schedule = schedules.data?.find((s) => s.id === scheduleId)
    const manager = managers.data?.find((m) => m.id === managerId) ?? null
    const branch = branches.data?.find((b) => b.id === branchId)

    update.mutate(
      {
        id: employee.id,
        patch: {
          branch_id: branchId,
          department_id: departmentId || null,
          team_id: teamId || null,
          schedule_id: scheduleId,
          manager_id: managerId || null,
          job_title: jobTitle.trim() || null,
          phone: phone.trim() || null,
          hire_date: hireDate || null,
        },
      },
      {
        onSuccess: (saved) => {
          onUpdated({
            ...employee,
            ...saved,
            branch,
            department,
            team,
            schedule,
            manager,
          })
          success("Placement updated", `${employee.full_name}'s assignment was saved.`)
        },
        onError: (err) => toastError("Update failed", err.message),
      }
    )
  }

  return (
    <div className="space-y-3 rounded-xl border p-3.5">
      <SectionHeading
        title="Placement"
        description={
          canEdit
            ? "Transfer, reporting line and contact details"
            : "Transfer, reporting line and contact details — read only"
        }
        icon={Building2}
      />
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2 disabled:opacity-70">
        <div className="space-y-2">
          <Label>Branch</Label>
          <Select
            value={branchId}
            onValueChange={(v) => {
              setBranchId(v)
              setDepartmentId("")
              setTeamId("")
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {(branches.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Department</Label>
          <Select
            value={departmentId || "none"}
            onValueChange={(v) => {
              setDepartmentId(v === "none" ? "" : v)
              setTeamId("")
            }}
            disabled={!branchId}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="No department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No department</SelectItem>
              {(departments.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Team</Label>
          <Select
            value={teamId || "none"}
            onValueChange={(v) => setTeamId(v === "none" ? "" : v)}
            disabled={!departmentId}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="No team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No team</SelectItem>
              {(teams.data ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Work schedule</Label>
          <Select value={scheduleId} onValueChange={setScheduleId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select schedule" />
            </SelectTrigger>
            <SelectContent>
              {(schedules.data ?? []).map((sc) => (
                <SelectItem key={sc.id} value={sc.id}>
                  {sc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Line manager</Label>
          <Select
            value={managerId || "none"}
            onValueChange={(v) => setManagerId(v === "none" ? "" : v)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="No line manager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No line manager</SelectItem>
              {(managers.data ?? [])
                .filter((m) => m.id !== employee.id)
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name} — {getRankLabel(m.rank)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Hire date</Label>
          <Input
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-2">
          <Label>Job title</Label>
          <Input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Sales Agent"
            className="h-9"
          />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+232 …"
            className="h-9"
          />
        </div>
      </fieldset>
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save placement"}
          </Button>
        </div>
      )}
    </div>
  )
}

function CredentialsCard({
  employeeNo,
  email,
  password,
}: {
  employeeNo: string
  email: string
  password: string
}) {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (key: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
  }

  const copyAll = () => {
    const text = [
      `Staff ID: ${employeeNo}`,
      `Email: ${email}`,
      `Temporary password: ${password}`,
      "",
      "Sign in at the Orange attendance portal, then set your own password.",
    ].join("\n")
    copy("all", text)
  }

  const fields = [
    { key: "staffId", label: "Staff ID", value: employeeNo },
    { key: "email", label: "Work email", value: email },
    { key: "password", label: "Temporary password", value: password },
  ]

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">{f.label}</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate rounded-lg border bg-muted/50 px-3 py-2 font-mono text-sm select-all">
              {f.value || "—"}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => copy(f.key, f.value)}
              disabled={!f.value}
            >
              {copied === f.key ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ))}
      <Callout variant="info">
        The employee signs in with the staff ID or work email and the temporary password, then is prompted to set a new
        password. The temporary password is shown only once.
      </Callout>
      <Button type="button" variant="secondary" className="w-full" onClick={copyAll}>
        {copied === "all" ? (
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4" /> Copied
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Copy className="h-4 w-4" /> Copy all details
          </span>
        )}
      </Button>
    </div>
  )
}
