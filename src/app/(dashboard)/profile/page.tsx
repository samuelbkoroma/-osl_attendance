"use client"

import React, { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/providers/auth-provider"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PageHeader } from "@/components/layout/page-header"
import { SectionHeading } from "@/components/dashboard"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AvatarUploader } from "@/components/profile/avatar-uploader"
import { QRBadgeModal } from "@/components/attendance/qr-badge-modal"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Callout } from "@/components/ui/callout"
import { useToast } from "@/providers/toast-provider"
import { useMyEmployee, useUpdateProfile } from "@/lib/queries"
import {
  getInitials,
  getRoleStyles,
  getRoleLabel,
  formatDate,
  getEmploymentStatusLabel,
  getEmploymentStatusStyles,
  formatScheduleSummary,
  cn,
} from "@/lib/utils"
import { formatWorkDays } from "@/lib/attendance"
import {
  User as UserIcon,
  Lock,
  IdCard,
  Mail,
  Phone,
  CalendarClock,
  Shield,
  Save,
  Building2,
  Briefcase,
  Clock3,
  Pencil,
  CalendarDays,
  Users,
  KeyRound,
  QrCode,
} from "lucide-react"

export default function ProfilePage() {
  const { user } = useAuth()
  const router = useRouter()
  const { success, error: toastError } = useToast()

  const myEmployee = useMyEmployee()
  const updateProfile = useUpdateProfile()

  const [fullName, setFullName] = useState("")
  const [badgeOpen, setBadgeOpen] = useState(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (user && !initializedRef.current) {
      initializedRef.current = true
      setFullName(user.full_name ?? "")
    }
  }, [user])

  const employee = myEmployee.data?.employee
  const schedule = myEmployee.data?.schedule

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (fullName.trim().length < 2) {
      toastError("Invalid name", "Enter your full name.")
      return
    }
    updateProfile.mutate(
      { full_name: fullName.trim() },
      {
        onSuccess: () => success("Profile updated", "Your name was saved."),
        onError: (err) => toastError("Update failed", err.message),
      }
    )
  }

  if (!user) {
    return (
      <DashboardLayout title="Profile">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64" />
        </div>
      </DashboardLayout>
    )
  }

  const roleStyles = getRoleStyles(user.role)
  const displayName = user.full_name ?? user.email ?? "Employee"
  const changedName = fullName.trim() !== (user.full_name ?? "").trim()

  const details = [
    { label: "Email", value: user.email, icon: Mail },
    { label: "Staff number", value: employee?.employee_no ?? "—", icon: IdCard, mono: true },
    { label: "Phone", value: employee?.phone ?? "—", icon: Phone },
    { label: "Branch", value: employee?.branch?.name ?? "—", icon: Building2 },
    { label: "Department", value: employee?.department?.name ?? "—", icon: Briefcase },
    { label: "Team", value: employee?.team?.name ?? "—", icon: Users },
    { label: "Hire date", value: employee?.hire_date ? formatDate(employee.hire_date) : "—", icon: CalendarClock },
    { label: "Member since", value: formatDate(user.created_at), icon: Shield },
  ]

  return (
    <DashboardLayout title="Profile">
      <div className="mx-auto max-w-4xl space-y-5 sm:space-y-6">
        <PageHeader
          title="My Profile"
          description="Your employee record, schedule and account settings"
          icon={UserIcon}
        />

        <Card className="overflow-hidden">
          <div className="h-20 bg-gradient-to-r from-primary/80 via-primary/50 to-primary/10 sm:h-24" />
          <CardContent className="p-4 sm:p-6">
            <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end">
              <AvatarUploader
                userId={user.id}
                fullName={displayName}
                avatarUrl={user.avatar_url}
                role={user.role}
              />
              <div className="min-w-0 flex-1 sm:pb-1">
                <h2 className="truncate text-xl font-bold tracking-tight">{displayName}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={roleStyles.badge}>
                    {getRoleLabel(user.role)}
                  </Badge>
                  {employee && (
                    <Badge variant="outline" className="font-mono">
                      {employee.employee_no}
                    </Badge>
                  )}
                  {employee && (
                    <Badge variant="outline" className={getEmploymentStatusStyles(employee.employment_status)}>
                      {getEmploymentStatusLabel(employee.employment_status)}
                    </Badge>
                  )}
                </div>
                {employee?.job_title && (
                  <p className="mt-1.5 text-[13px] text-muted-foreground">{employee.job_title}</p>
                )}
              </div>
              {employee && (
                <div className="sm:pb-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-orange-500/30 hover:border-orange-500 hover:bg-orange-500/10 text-xs font-semibold"
                    onClick={() => setBadgeOpen(true)}
                  >
                    <QrCode className="h-4 w-4 text-orange-500" />
                    Digital Badge
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 border-t pt-5 sm:grid-cols-2">
              {details.map((d) => (
                <div key={d.label} className="flex items-center gap-2.5 text-[13px]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <d.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.label}</p>
                    <p className={cn("truncate font-medium", d.mono && "font-mono text-[12px]")}>{d.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {schedule ? (
              <Card>
                <CardHeader className="pb-3">
                  <SectionHeading
                    title="Work schedule"
                    description={formatScheduleSummary(schedule)}
                    icon={Clock3}
                  />
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["Start", schedule.start_time.slice(0, 5)],
                      ["End", schedule.end_time.slice(0, 5)],
                      ["Grace", `${schedule.grace_minutes} min`],
                      ["Days", formatWorkDays(schedule.work_days)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-muted/40 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                        <p className="mt-0.5 text-[13px] font-semibold tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Your schedule is set by HR. Ask them if your working days change.
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8">
                  <SectionHeading
                    title="Work schedule"
                    description="No schedule is linked to your employee record yet."
                    icon={Clock3}
                  />
                  <p className="mt-2 text-[12.5px] text-muted-foreground">
                    Contact HR if this looks wrong — your check-in times depend on it.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <SectionHeading
                  title="Edit profile"
                  description="Change your display name or profile photo. Other details are maintained by HR."
                  icon={Pencil}
                />
              </CardHeader>
              <CardContent className="space-y-5">
                <AvatarUploader
                  userId={user.id}
                  fullName={displayName}
                  avatarUrl={user.avatar_url}
                />
                <form onSubmit={handleSubmit} className="space-y-4 border-t pt-5">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full name</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      minLength={2}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" disabled={updateProfile.isPending || !changedName}>
                      <Save className="mr-2 h-4 w-4" />
                      {updateProfile.isPending ? "Saving…" : "Save changes"}
                    </Button>
                    {changedName && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setFullName(user.full_name ?? "")}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <SectionHeading title="Account security" icon={Lock} />
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-[12.5px] leading-5 text-muted-foreground">
                  Use a password only you know, and change it if you think someone else has seen it.
                </p>
                <Button variant="outline" className="w-full" onClick={() => router.push("/change-password")}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Change password
                </Button>
              </CardContent>
            </Card>

            <Callout variant="tip" title="Need something changed?">
              Branch, department, job title, role and schedule are managed by HR. Ask them to update your record.
            </Callout>
          </div>
        </div>

        {employee && (
          <QRBadgeModal
            open={badgeOpen}
            onOpenChange={setBadgeOpen}
            employee={{
              id: employee.id,
              employee_no: employee.employee_no,
              full_name: employee.full_name,
              job_title: employee.job_title,
              branch: employee.branch,
              department: employee.department,
              rank: employee.rank,
              profile: user,
            }}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
