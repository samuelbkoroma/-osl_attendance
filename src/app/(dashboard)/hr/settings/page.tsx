"use client"

import React, { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Callout } from "@/components/ui/callout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { canManageSettings } from "@/lib/navigation"
import { useAuth } from "@/providers/auth-provider"
import {
  useOrgSettings,
  useUpdateOrgSettings,
  useBranches,
  useCreateBranch,
  useUpdateBranch,
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useTeams,
  useCreateTeam,
  useSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useHolidays,
  useCreateHoliday,
  useDeleteHoliday,
  useAuditLogs,
  useEmailOutbox,
} from "@/lib/queries"
import type { Branch, Department, EmailOutboxItem, Holiday, OrgSettings, WorkSchedule, Weekday } from "@/types"
import { formatWorkDays } from "@/lib/attendance"
import { getCurrentPosition } from "@/lib/geofence"
import { formatDate, cn } from "@/lib/utils"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { usePagination } from "@/lib/use-pagination"
import { downloadCSV } from "@/lib/export"
import {
  Settings,
  Building2,
  Network,
  UsersRound,
  CalendarClock,
  CalendarOff,
  ScrollText,
  Mail,
  Plus,
  Pencil,
  Trash2,
  FileDown,
  RefreshCw,
  Search,
  MapPin,
} from "lucide-react"

const WEEKDAYS: Array<{ day: Weekday; label: string }> = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 7, label: "Sun" },
]

function YesNoSelect(props: {
  value: boolean
  onChange: (v: boolean) => void
  id?: string
}) {
  return (
    <Select value={props.value ? "yes" : "no"} onValueChange={(v) => props.onChange(v === "yes")}>
      <SelectTrigger id={props.id} className="h-9"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="yes">Yes</SelectItem>
        <SelectItem value="no">No</SelectItem>
      </SelectContent>
    </Select>
  )
}

/* ------------------------------------------------------------------ */
/* Organization tab                                                    */
/* ------------------------------------------------------------------ */
function OrgTab() {
  const settings = useOrgSettings()

  if (settings.isLoading) return <Skeleton className="h-64" />
  if (!settings.data) {
    return (
      <Card>
        <CardContent className="py-10">
          <EmptyState
            icon={Settings}
            title="Organization settings missing"
            description="Run the workforce migrations to create the settings row."
          />
        </CardContent>
      </Card>
    )
  }
  return <OrgForm key={settings.data.updated_at} settings={settings.data} />
}

function OrgForm({ settings }: { settings: OrgSettings }) {
  const { success, error: toastError } = useToast()
  const update = useUpdateOrgSettings()

  const [form, setForm] = useState({
    org_name: settings.org_name,
    hr_cutoff_time: settings.hr_cutoff_time,
    standard_start_time: settings.standard_start_time,
    standard_end_time: settings.standard_end_time,
    default_grace_minutes: settings.default_grace_minutes,
    require_location: settings.require_location,
  })

  const save = () => {
    update.mutate(form, {
      onSuccess: () => success("Settings saved", "Organization rules updated."),
      onError: (err) => toastError("Save failed", err.message),
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Organization</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Organization name</Label>
            <Input value={form.org_name} onChange={(e) => setForm({ ...form, org_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Input value={settings.timezone} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-cutoff">HR cutoff time (08:45 report)</Label>
            <Input
              id="org-cutoff"
              type="time"
              value={form.hr_cutoff_time}
              onChange={(e) => setForm({ ...form, hr_cutoff_time: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Grace period (minutes)</Label>
            <Input
              type="number"
              min={0}
              max={60}
              value={form.default_grace_minutes}
              onChange={(e) => setForm({ ...form, default_grace_minutes: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Standard start</Label>
            <Input
              type="time"
              value={form.standard_start_time}
              onChange={(e) => setForm({ ...form, standard_start_time: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Standard end</Label>
            <Input
              type="time"
              value={form.standard_end_time}
              onChange={(e) => setForm({ ...form, standard_end_time: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Require location for check-in</Label>
            <YesNoSelect
              value={form.require_location}
              onChange={(v) => setForm({ ...form, require_location: v })}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Branches tab                                                        */
/* ------------------------------------------------------------------ */
const EMPTY_BRANCH = {
  name: "",
  code: "",
  region: "",
  address: "",
  phone: "",
  latitude: "" as string | number,
  longitude: "" as string | number,
  radius_meters: 150,
  require_location: true,
  is_active: true,
}

function BranchesTab() {
  const { success, error: toastError } = useToast()
  const branches = useBranches(false)
  const create = useCreateBranch()
  const update = useUpdateBranch()

  const [editing, setEditing] = useState<Branch | "new" | null>(null)
  const [form, setForm] = useState({ ...EMPTY_BRANCH })
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locationNote, setLocationNote] = useState<string | null>(null)

  const captureLocation = async () => {
    setLocating(true)
    setLocationError(null)
    setLocationNote(null)
    try {
      const pos = await getCurrentPosition()
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      const accuracy = Math.round(pos.coords.accuracy)
      setForm((f) => ({
        ...f,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
      }))
      setLocationNote(
        `Captured ${lat.toFixed(6)}, ${lng.toFixed(6)} (±${accuracy} m). Save to apply.`
      )
    } catch (err) {
      setLocationError(
        err instanceof GeolocationPositionError && err.code === err.PERMISSION_DENIED
          ? "Location access was blocked. Allow it for this site in your browser settings, then try again."
          : err instanceof Error
            ? err.message
            : "Could not read a GPS fix from this device."
      )
    } finally {
      setLocating(false)
    }
  }

  const openNew = () => {
    setForm({ ...EMPTY_BRANCH })
    setEditing("new")
  }

  const openEdit = (b: Branch) => {
    setForm({
      name: b.name,
      code: b.code,
      region: b.region ?? "",
      address: b.address ?? "",
      phone: b.phone ?? "",
      latitude: b.latitude ?? "",
      longitude: b.longitude ?? "",
      radius_meters: b.radius_meters,
      require_location: b.require_location,
      is_active: b.is_active,
    })
    setEditing(b)
  }

  const save = () => {
    if (!form.name.trim() || !form.code.trim()) {
      toastError("Missing details", "Branch name and code are required.")
      return
    }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      region: form.region.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      latitude: form.latitude === "" ? null : Number(form.latitude),
      longitude: form.longitude === "" ? null : Number(form.longitude),
      radius_meters: Number(form.radius_meters) || 150,
      require_location: form.require_location,
      is_active: form.is_active,
    }
    const opts = {
      onSuccess: () => {
        success("Branch saved", payload.name)
        setEditing(null)
      },
      onError: (err: Error) => toastError("Save failed", err.message),
    }
    if (editing === "new") create.mutate(payload, opts)
    else if (editing) update.mutate({ id: editing.id, patch: payload }, opts)
  }

  const rows = branches.data ?? []

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add branch
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {branches.isLoading ? (
            <Skeleton className="h-40" />
          ) : rows.length === 0 ? (
            <EmptyState icon={Building2} title="No branches" description="Add the first branch." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Branch</th>
                    <th className="py-2 pr-4 font-medium">Region</th>
                    <th className="py-2 pr-4 font-medium">Geofence</th>
                    <th className="py-2 pr-4 font-medium">Location req.</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium">{b.name}</div>
                        <div className="text-xs font-mono text-muted-foreground">{b.code}</div>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{b.region ?? "—"}</td>
                      <td className="py-2.5 pr-4 tabular-nums">
                        {b.latitude !== null && b.longitude !== null
                          ? `${b.radius_meters} m`
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-4">{b.require_location ? "Yes" : "No"}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className={b.is_active ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-zinc-100 text-zinc-500"}>
                          {b.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right">
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => openEdit(b)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add branch" : "Edit branch"}</DialogTitle>
            <DialogDescription>
              Geofence coordinates + radius control where check-ins are accepted.
            </DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Code *</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Latitude</Label>
              <Input
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Longitude</Label>
              <Input
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={captureLocation}
                disabled={locating}
              >
                <MapPin className="mr-2 h-4 w-4" />
                {locating ? "Locating…" : "Use my current location"}
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {locationError
                  ? locationError
                  : locationNote
                    ? locationNote
                    : "Captures this device's GPS fix and fills the coordinates above. Best run while standing at the branch entrance."}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Radius (m)</Label>
              <Input
                type="number"
                min={50}
                value={form.radius_meters}
                onChange={(e) => setForm({ ...form, radius_meters: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Require location</Label>
              <YesNoSelect
                value={form.require_location}
                onChange={(v) => setForm({ ...form, require_location: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Active</Label>
              <YesNoSelect value={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Departments tab                                                     */
/* ------------------------------------------------------------------ */
function DepartmentsTab() {
  const { success, error: toastError } = useToast()
  const branches = useBranches(false)
  const [branchId, setBranchId] = useState("all")
  const departments = useDepartments(branchId === "all" ? undefined : branchId)
  const create = useCreateDepartment()
  const update = useUpdateDepartment()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [targetBranch, setTargetBranch] = useState("")

  const submit = () => {
    const branch = targetBranch || branchId
    if (!name.trim() || branch === "all") {
      toastError("Missing details", "Name and branch are required.")
      return
    }
    create.mutate(
      { branch_id: branch, name: name.trim(), code: code.trim() || null },
      {
        onSuccess: () => {
          success("Department added", name.trim())
          setDialogOpen(false)
          setName("")
          setCode("")
        },
        onError: (err) => toastError("Save failed", err.message),
      }
    )
  }

  const toggleActive = (d: Department) => {
    update.mutate(
      { id: d.id, patch: { is_active: !d.is_active } },
      {
        onSuccess: () => success(d.is_active ? "Department deactivated" : "Department activated", d.name),
        onError: (err) => toastError("Update failed", err.message),
      }
    )
  }

  const rows = departments.data ?? []

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="h-9 w-full sm:w-56"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {(branches.data ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => { setTargetBranch(branchId === "all" ? "" : branchId); setDialogOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Add department
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {departments.isLoading ? (
            <Skeleton className="h-40" />
          ) : rows.length === 0 ? (
            <EmptyState icon={Network} title="No departments" description="Add a department for this branch." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Department</th>
                    <th className="py-2 pr-4 font-medium">Branch</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium">{d.name}</div>
                        {d.code && <div className="text-xs font-mono text-muted-foreground">{d.code}</div>}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{d.branch?.name ?? "—"}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className={d.is_active ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-zinc-100 text-zinc-500"}>
                          {d.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right">
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => toggleActive(d)}>
                          {d.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add department</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Branch *</Label>
              <Select value={targetBranch} onValueChange={setTargetBranch}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {(branches.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Teams tab                                                           */
/* ------------------------------------------------------------------ */
function TeamsTab() {
  const { success, error: toastError } = useToast()
  const departments = useDepartments(undefined)
  const [departmentId, setDepartmentId] = useState("all")
  const teams = useTeams(departmentId === "all" ? undefined : departmentId)
  const create = useCreateTeam()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [targetDepartment, setTargetDepartment] = useState("")

  const submit = () => {
    const dept = targetDepartment || departmentId
    if (!name.trim() || dept === "all") {
      toastError("Missing details", "Name and department are required.")
      return
    }
    create.mutate(
      { department_id: dept, name: name.trim() },
      {
        onSuccess: () => {
          success("Team added", name.trim())
          setDialogOpen(false)
          setName("")
        },
        onError: (err) => toastError("Save failed", err.message),
      }
    )
  }

  const rows = teams.data ?? []
  const deptName = (id: string) =>
    departments.data?.find((d) => d.id === id)?.name ?? "—"

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger className="h-9 w-full sm:w-56"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {(departments.data ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => { setTargetDepartment(departmentId === "all" ? "" : departmentId); setDialogOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Add team
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {teams.isLoading ? (
            <Skeleton className="h-40" />
          ) : rows.length === 0 ? (
            <EmptyState icon={UsersRound} title="No teams" description="Add a team under a department." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Team</th>
                    <th className="py-2 font-medium">Department</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{t.name}</td>
                      <td className="py-2.5 text-muted-foreground">{deptName(t.department_id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add team</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Department *</Label>
              <Select value={targetDepartment} onValueChange={setTargetDepartment}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {(departments.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Schedules tab                                                       */
/* ------------------------------------------------------------------ */
interface ScheduleForm {
  name: string
  code: string
  work_days: Weekday[]
  start_time: string
  end_time: string
  grace_minutes: number
  is_default: boolean
  is_active: boolean
}

const EMPTY_SCHEDULE: ScheduleForm = {
  name: "",
  code: "",
  work_days: [1, 2, 3, 4, 5],
  start_time: "08:00",
  end_time: "17:00",
  grace_minutes: 10,
  is_default: false,
  is_active: true,
}

function SchedulesTab() {
  const { success, error: toastError } = useToast()
  const schedules = useSchedules(false)
  const create = useCreateSchedule()
  const update = useUpdateSchedule()

  const [editing, setEditing] = useState<WorkSchedule | "new" | null>(null)
  const [form, setForm] = useState<ScheduleForm>({ ...EMPTY_SCHEDULE })

  const toggleDay = (day: Weekday) =>
    setForm((f) => ({
      ...f,
      work_days: f.work_days.includes(day)
        ? f.work_days.filter((d) => d !== day)
        : [...f.work_days, day].sort((a, b) => a - b),
    }))

  const save = () => {
    if (!form.name.trim() || form.work_days.length === 0) {
      toastError("Missing details", "Name and at least one work day are required.")
      return
    }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      work_days: form.work_days,
      start_time: form.start_time,
      end_time: form.end_time,
      grace_minutes: form.grace_minutes,
      is_default: form.is_default,
      is_active: form.is_active,
    }
    const opts = {
      onSuccess: () => {
        success("Schedule saved", payload.name)
        setEditing(null)
      },
      onError: (err: Error) => toastError("Save failed", err.message),
    }
    if (editing === "new") create.mutate(payload, opts)
    else if (editing) update.mutate({ id: editing.id, patch: payload }, opts)
  }

  const rows = schedules.data ?? []

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => { setForm({ ...EMPTY_SCHEDULE }); setEditing("new") }}>
          <Plus className="mr-2 h-4 w-4" />
          Add schedule
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {schedules.isLoading ? (
            <Skeleton className="h-40" />
          ) : rows.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No schedules" description="Add a work schedule." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Schedule</th>
                    <th className="py-2 pr-4 font-medium">Work days</th>
                    <th className="py-2 pr-4 font-medium">Hours</th>
                    <th className="py-2 pr-4 font-medium">Grace</th>
                    <th className="py-2 pr-4 font-medium">Flags</th>
                    <th className="py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium">{s.name}</div>
                        {s.code && <div className="text-xs font-mono text-muted-foreground">{s.code}</div>}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{formatWorkDays(s.work_days)}</td>
                      <td className="py-2.5 pr-4 tabular-nums">
                        {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">{s.grace_minutes}m</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex gap-1">
                          {s.is_default && <Badge variant="outline">Default</Badge>}
                          {!s.is_active && <Badge variant="outline" className="bg-zinc-100 text-zinc-500">Off</Badge>}
                        </div>
                      </td>
                      <td className="py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => {
                            setForm({
                              name: s.name,
                              code: s.code ?? "",
                              work_days: s.work_days,
                              start_time: s.start_time,
                              end_time: s.end_time,
                              grace_minutes: s.grace_minutes,
                              is_default: s.is_default,
                              is_active: s.is_active,
                            })
                            setEditing(s)
                          }}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add schedule" : "Edit schedule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Start</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Grace (min)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.grace_minutes}
                  onChange={(e) => setForm({ ...form, grace_minutes: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Default</Label>
                <YesNoSelect value={form.is_default} onChange={(v) => setForm({ ...form, is_default: v })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Work days</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((w) => {
                  const active = form.work_days.includes(w.day)
                  return (
                    <Button
                      key={w.day}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="h-9 w-12 px-0"
                      onClick={() => toggleDay(w.day)}
                    >
                      {w.label}
                    </Button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Active</Label>
              <YesNoSelect value={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Holidays tab                                                        */
/* ------------------------------------------------------------------ */
function HolidaysTab() {
  const { success, error: toastError, warning } = useToast()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(String(currentYear))
  const holidays = useHolidays(Number(year))
  const branches = useBranches(false)
  const create = useCreateHoliday()
  const remove = useDeleteHoliday()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [holidayDate, setHolidayDate] = useState("")
  const [branchId, setBranchId] = useState("all")

  const submit = () => {
    if (!name.trim() || !holidayDate) {
      toastError("Missing details", "Name and date are required.")
      return
    }
    create.mutate(
      {
        name: name.trim(),
        holiday_date: holidayDate,
        branch_id: branchId === "all" ? null : branchId,
      },
      {
        onSuccess: () => {
          success("Holiday added", `${name.trim()} · ${formatDate(holidayDate)}`)
          setDialogOpen(false)
          setName("")
          setHolidayDate("")
        },
        onError: (err) => toastError("Save failed", err.message),
      }
    )
  }

  const del = (h: Holiday) => {
    warning("Delete holiday?", `Press Delete again to confirm removal of "${h.name}".`)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        remove.mutate(h.id, {
          onSuccess: () => success("Holiday deleted", h.name),
          onError: (err) => toastError("Delete failed", err.message),
        })
      }
      window.removeEventListener("keydown", onKey)
    }
    window.addEventListener("keydown", onKey)
    setTimeout(() => window.removeEventListener("keydown", onKey), 5000)
  }

  const rows = holidays.data ?? []
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear + 1 - i))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="h-9 w-full sm:w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add holiday
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {holidays.isLoading ? (
            <Skeleton className="h-40" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title={`No holidays in ${year}`}
              description="Public holidays skip absence classification."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Holiday</th>
                    <th className="py-2 pr-4 font-medium">Scope</th>
                    <th className="py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((h) => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-xs">{h.holiday_date}</td>
                      <td className="py-2.5 pr-4 font-medium">{h.name}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {h.branch ? h.branch.name : "All branches"}
                      </td>
                      <td className="py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive"
                          onClick={() => del(h)}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add holiday</DialogTitle>
            <DialogDescription>Leave scope as “All branches” for national holidays.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Independence Day" />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {(branches.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Audit tab                                                           */
/* ------------------------------------------------------------------ */
function AuditTab() {
  const logs = useAuditLogs(200)
  const rows = useMemo(() => logs.data ?? [], [logs.data])
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (log) =>
        log.action.toLowerCase().includes(q) ||
        (log.entity ?? "").toLowerCase().includes(q) ||
        JSON.stringify(log.details ?? {}).toLowerCase().includes(q)
    )
  }, [rows, query])
  const pager = usePagination(filtered, 25)

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              pager.setPage(1)
            }}
            placeholder="Search action, entity or details"
            className="h-9 pl-8 text-[13px]"
          />
        </div>
        {logs.isLoading ? (
          <Skeleton className="h-40" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={rows.length === 0 ? "No audit activity" : "Nothing matches"}
            description={rows.length === 0 ? "HR actions will appear here." : "Try a different search."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 pr-4 font-medium">Entity</th>
                  <th className="py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {pager.visible.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 align-top">
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant="outline" className="font-mono text-xs">{log.action}</Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {log.entity ?? "—"}
                      {log.entity_id ? <span className="font-mono text-xs"> {log.entity_id.slice(0, 8)}</span> : null}
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground max-w-md truncate">
                      {Object.keys(log.details ?? {}).length > 0
                        ? JSON.stringify(log.details)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationBar
              page={pager.page}
              pageCount={pager.pageCount}
              total={filtered.length}
              start={pager.start}
              end={pager.end}
              onPageChange={pager.setPage}
              label="log entries"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Missed clock-in alert outbox tab                                    */
/* ------------------------------------------------------------------ */
function statusStylesFor(status: EmailOutboxItem["status"]): string {
  switch (status) {
    case "sent":
      return "bg-emerald-100 text-emerald-700 border-emerald-200"
    case "failed":
      return "bg-red-100 text-red-700 border-red-200"
    case "skipped":
      return "bg-zinc-100 text-zinc-500 border-zinc-200"
    default:
      return "bg-amber-100 text-amber-700 border-amber-200"
  }
}

function AlertsTab() {
  const outbox = useEmailOutbox(200)
  const rows = useMemo(() => outbox.data ?? [], [outbox.data])
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()
  const [retrying, setRetrying] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(
      (mail) =>
        (statusFilter === "all" || mail.status === statusFilter) &&
        (!q ||
          mail.to_email.toLowerCase().includes(q) ||
          mail.subject.toLowerCase().includes(q) ||
          mail.category.toLowerCase().includes(q))
    )
  }, [rows, statusFilter, query])
  const pager = usePagination(filtered, 25)

  const retry = async (id?: string) => {
    setRetrying(id ?? "all")
    try {
      const res = await fetch("/api/hr/email/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { all_failed: true }),
      })
      const data = (await res.json()) as {
        error?: string
        reset?: number
        email?: { sent?: number; failed?: number; skipped?: number }
      }
      if (!res.ok) throw new Error(data.error ?? "Retry failed")
      success(
        "Retry finished",
        `${data.reset ?? 0} reset · ${data.email?.sent ?? 0} sent · ${data.email?.failed ?? 0} failed`
      )
      queryClient.invalidateQueries({ queryKey: ["email-outbox"] })
    } catch (err) {
      toastError("Retry failed", err instanceof Error ? err.message : "Try again shortly.")
    } finally {
      setRetrying(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Email outbox</CardTitle>
            <p className="text-sm text-muted-foreground">
              Immediate clock-in/out alerts, missed cutoff notices and daily digests. Failed
              messages can be retried here.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {rows.some((r) => r.status === "failed") && (
              <Button
                variant="outline"
                size="sm"
                disabled={retrying !== null}
                onClick={() => retry()}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", retrying === "all" && "animate-spin")} />
                Retry failed
              </Button>
            )}
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length === 0}
            onClick={() =>
              downloadCSV(
                "email_outbox",
                rows.map((m) => ({
                  created_at: m.created_at,
                  recipient: m.to_email,
                  subject: m.subject,
                  category: m.category,
                  status: m.status,
                  attempts: m.attempts,
                  sent_at: m.sent_at ?? "",
                  last_error: m.last_error ?? "",
                }))
              )
            }
          >
            <FileDown className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                pager.setPage(1)
              }}
              placeholder="Search recipient, subject or category"
              className="h-9 pl-8 text-[13px]"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v)
              pager.setPage(1)
            }}
          >
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {outbox.isLoading ? (
          <Skeleton className="h-40" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Mail}
            title={rows.length === 0 ? "No alerts queued" : "Nothing matches"}
            description={
              rows.length === 0
                ? "Clock-in/out alerts and cutoff emails will be listed here once queued."
                : "Try another status or search."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                  <th className="py-2 pr-4 font-medium">Queued</th>
                  <th className="py-2 pr-4 font-medium">Recipient</th>
                  <th className="py-2 pr-4 font-medium">Subject</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {pager.visible.map((mail) => (
                  <tr key={mail.id} className="border-b last:border-0 align-top">
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(mail.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="py-2.5 pr-4">{mail.to_email}</td>
                    <td className="py-2.5 pr-4 max-w-sm truncate">{mail.subject}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={statusStylesFor(mail.status)}>
                          {mail.status}
                        </Badge>
                        {mail.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={retrying !== null}
                            onClick={() => retry(mail.id)}
                          >
                            <RefreshCw className={cn("mr-1 h-3 w-3", retrying === mail.id && "animate-spin")} />
                            Retry
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground max-w-xs truncate">
                      {mail.last_error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationBar
              page={pager.page}
              pageCount={pager.pageCount}
              total={filtered.length}
              start={pager.start}
              end={pager.end}
              onPageChange={pager.setPage}
              label="emails"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function HrSettingsPage() {
  const { user } = useAuth()

  // Server-side middleware already redirects non-admins, but keep the page
  // itself honest so a stale client bundle or a direct link never renders
  // admin forms that cannot save.
  if (!canManageSettings(user?.role)) {
    return (
      <DashboardLayout title="Settings">
        <Callout variant="warning" title="Restricted area">
          System settings are limited to HR administrators and super admins. Ask your HR lead if you
          need a change to organisation rules, branch locations or schedules.
        </Callout>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Settings">
      <div className="space-y-6">
        <PageHeader
          title="System Settings"
          description="Organization rules, structure, schedules and audit trail"
          icon={Settings}
        />
        <Tabs defaultValue="organization">
          <Callout variant="tip" title="Admin area">
            These settings apply to everyone. Changes save immediately or with the save button on each tab. If
            you are unsure about a value, check with your HR lead before changing it.
          </Callout>
          <TabsList className="h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="organization" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Organization
            </TabsTrigger>
            <TabsTrigger value="branches" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Branches
            </TabsTrigger>
            <TabsTrigger value="departments" className="gap-1.5">
              <Network className="h-3.5 w-3.5" />
              Departments
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-1.5">
              <UsersRound className="h-3.5 w-3.5" />
              Teams
            </TabsTrigger>
            <TabsTrigger value="schedules" className="gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Schedules
            </TabsTrigger>
            <TabsTrigger value="holidays" className="gap-1.5">
              <CalendarOff className="h-3.5 w-3.5" />
              Holidays
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Alerts
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <ScrollText className="h-3.5 w-3.5" />
              Audit log
            </TabsTrigger>
          </TabsList>
          <TabsContent value="organization"><OrgTab /></TabsContent>
          <TabsContent value="branches"><BranchesTab /></TabsContent>
          <TabsContent value="departments"><DepartmentsTab /></TabsContent>
          <TabsContent value="teams"><TeamsTab /></TabsContent>
          <TabsContent value="schedules"><SchedulesTab /></TabsContent>
          <TabsContent value="holidays"><HolidaysTab /></TabsContent>
          <TabsContent value="alerts"><AlertsTab /></TabsContent>
          <TabsContent value="audit"><AuditTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
