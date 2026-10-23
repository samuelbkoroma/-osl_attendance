"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/providers/auth-provider"
import { useToast } from "@/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getInitials, getRoleStyles, getRoleLabel, formatDate, formatTime, getDayOfWeek, cn } from "@/lib/utils"
import { isHrRole } from "@/lib/navigation"
import { Menu, LogOut, User, Calendar, Clock, Lock, CheckCircle, XCircle, Bell, Fingerprint, ChevronRight } from "lucide-react"
import { useUnreadNotificationCount } from "@/lib/queries"
import Image from "next/image"
import { HelpButton } from "./help-sheet"

interface HeaderProps {
  onMenuClick: () => void
  title?: string
}

export function Header({ onMenuClick, title }: HeaderProps) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const { error: toastError, success } = useToast()
  const { data: unread = 0 } = useUnreadNotificationCount()
  const [now, setNow] = useState(new Date())
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordResult, setPasswordResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordResult(null)
    if (newPassword !== confirmPassword) {
      setPasswordResult({ success: false, message: "Passwords do not match" })
      toastError("Passwords do not match", "Please make sure both passwords match.")
      return
    }
    if (newPassword.length < 6) {
      setPasswordResult({ success: false, message: "Password must be at least 6 characters" })
      toastError("Weak password", "Password must be at least 6 characters.")
      return
    }
    setChangingPassword(true)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (res.ok) {
        setPasswordResult({ success: true, message: "Password changed successfully" })
        success("Password changed", "Your password was updated successfully.")
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
        setTimeout(() => { setShowChangePassword(false); setPasswordResult(null) }, 2000)
      } else {
        setPasswordResult({ success: false, message: data.error || "Failed to change password" })
        toastError("Password change failed", data.error || "Please try again.")
      }
    } catch {
      setPasswordResult({ success: false, message: "Network error" })
      toastError("Network error", "Please check your connection and try again.")
    }
    setChangingPassword(false)
  }

  const canClockIn = user && (isHrRole(user.role) || user.role === "branch_manager")

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center gap-2 px-4 lg:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground lg:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex min-w-0 items-center gap-2">
          <Link href="/" className="lg:hidden flex shrink-0 overflow-hidden rounded-lg ring-1 ring-border/60">
            <Image src="/logo.png" alt="Orange" width={28} height={28} />
          </Link>
          <div className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
            <span className="text-muted-foreground">Workforce</span>
            {title && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                <span className="truncate font-semibold text-foreground">{title}</span>
              </>
            )}
          </div>
          {title && <span className="truncate text-sm font-semibold lg:hidden">{title}</span>}
        </div>

        <div className="flex-1" />

        <div className="hidden items-center gap-1.5 xl:flex">
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">{getDayOfWeek(now)}, {formatDate(now)}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono font-medium tabular-nums">{formatTime(now)}</span>
          </div>
        </div>

        {canClockIn && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="ml-1 hidden rounded-full md:inline-flex"
          >
            <Link href="/employee">
              <Fingerprint className="h-4 w-4 text-primary" />
              <span className="hidden lg:inline">My attendance</span>
            </Link>
          </Button>
        )}

        <HelpButton className="ml-1" />

        {user && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative text-muted-foreground hover:text-foreground"
            onClick={() => router.push("/notifications")}
            aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
        )}

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "relative ml-0.5 h-9 w-9 rounded-full ring-2 transition-all hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-4",
                  getRoleStyles(user.role).ring
                )}
                aria-label="Open account menu"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user.avatar_url ?? undefined} alt={user.full_name ?? user.email ?? "User"} />
                  <AvatarFallback className={cn("text-xs font-semibold", getRoleStyles(user.role).avatar)}>
                    {getInitials(user.full_name ?? user.email ?? "User")}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-60 max-w-[calc(100vw-2rem)]" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="truncate text-sm font-semibold leading-none">{user.full_name}</p>
                  <p className="truncate text-xs leading-none text-muted-foreground">{user.email}</p>
                  <p className={cn("mt-1 text-[11px] font-semibold leading-none", getRoleStyles(user.role).label)}>
                    {getRoleLabel(user.role)}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                <User className="mr-2 h-4 w-4" />
                <span>My profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setShowChangePassword(true); setPasswordResult(null) }}>
                <Lock className="mr-2 h-4 w-4" />
                <span>Change password</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/notifications")}>
                <Bell className="mr-2 h-4 w-4" />
                <span>Notifications</span>
                {unread > 0 && (
                  <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    {unread}
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Choose a new password you will remember.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword}>
            <div className="space-y-4">
              {passwordResult && (
                <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${
                  passwordResult.success ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                }`}>
                  {passwordResult.success ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>{passwordResult.message}</span>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="headerCurrentPassword">Current password</Label>
                <Input
                  id="headerCurrentPassword"
                  type="password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="headerNewPassword">New password</Label>
                <Input
                  id="headerNewPassword"
                  type="password"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="headerConfirmPassword">Confirm new password</Label>
                <Input
                  id="headerConfirmPassword"
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowChangePassword(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={changingPassword}>
                {changingPassword ? "Updating..." : "Update password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  )
}
