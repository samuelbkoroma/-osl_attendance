"use client"

import React, { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn, getInitials, getRoleStyles, getRoleLabel } from "@/lib/utils"
import { useAuth } from "@/providers/auth-provider"
import { useUnreadNotificationCount } from "@/lib/queries"
import { homeForRole } from "@/lib/navigation"
import { getNavGroups, isNavItemActive, type NavItem } from "./nav-config"
import { HelpDialog } from "./help-sheet"
import {
  ChevronLeft,
  HelpCircle,
  LogOut,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const sidebarRoleLabel: Record<string, string> = {
  super_admin: "text-purple-300",
  hr_admin: "text-orange-300",
  hr_officer: "text-blue-300",
  branch_manager: "text-teal-300",
  employee: "text-emerald-300",
}

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

function NavLink({
  item,
  active,
  collapsed,
  unread,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  collapsed?: boolean
  unread: number
  onNavigate?: () => void
}) {
  const badge =
    item.href === "/notifications" && unread > 0 ? (unread > 9 ? "9+" : String(unread)) : null

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
        active
          ? "bg-sidebar-accent text-white shadow-sm"
          : "text-white/55 hover:bg-white/[0.06] hover:text-white",
        collapsed && "justify-center px-2 py-3"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-sidebar-accent-foreground" />
      )}
      <item.icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          active ? "text-sidebar-accent-foreground" : "text-white/45 group-hover:text-white/80"
        )}
      />
      {!collapsed && (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{item.label}</span>
          {item.description && (
            <span className={cn("truncate text-[10.5px] font-normal leading-tight", active ? "text-white/60" : "text-white/30")}>
              {item.description}
            </span>
          )}
        </span>
      )}
      {badge && (
        <span
          className={cn(
            "flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white",
            collapsed && "absolute -right-0.5 -top-0.5 h-4 min-w-4 m-0 px-1"
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="hidden lg:block">
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }
  return link
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const { data: unreadNotifs = 0 } = useUnreadNotificationCount()
  const [helpOpen, setHelpOpen] = useState(false)

  if (!user) return null

  const groups = getNavGroups(user.role)
  const dashboardHref = homeForRole(user.role)

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full max-w-[86vw] flex-col bg-sidebar transition-all duration-300",
          collapsed ? "w-[72px]" : "w-[268px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        aria-label="Main navigation"
      >
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b border-white/[0.06]",
            collapsed ? "justify-center px-2" : "justify-between px-4"
          )}
        >
          <Link href={dashboardHref} className="group flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl shadow-lg shadow-primary/25 ring-1 ring-white/10">
              <Image src="/logo.png" alt="Orange" width={36} height={36} />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-bold leading-tight text-white">Orange SL</span>
                <span className="text-[10px] leading-tight text-white/45">Workforce Attendance</span>
              </div>
            )}
          </Link>
          {!collapsed && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                className="hidden text-white/40 hover:bg-white/5 hover:text-white lg:flex"
                onClick={onToggle}
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-white/40 hover:bg-white/5 hover:text-white lg:hidden"
                onClick={onMobileClose}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          {collapsed && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute -right-3 top-16 hidden h-6 w-6 rounded-full border border-white/10 bg-sidebar text-white/50 shadow-md hover:text-white lg:flex"
              onClick={onToggle}
              aria-label="Expand sidebar"
            >
              <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
            </Button>
          )}
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isNavItemActive(pathname, item, dashboardHref)
                  return (
                    <NavLink
                      key={item.href}
                      item={item}
                      active={active}
                      collapsed={collapsed}
                      unread={unreadNotifs}
                      onNavigate={onMobileClose}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {!collapsed && (
          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] p-3 text-left transition-colors hover:border-primary/30 hover:bg-white/[0.06]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <HelpCircle className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-white/85">Need a hand?</span>
                <span className="block text-[10.5px] leading-tight text-white/35">Open the quick guide</span>
              </span>
            </button>
          </div>
        )}

        <Separator className="bg-white/[0.06]" />

        <div className={cn("p-3", collapsed && "px-2")}>
          <div className={cn("flex items-center gap-2.5 rounded-xl p-2", collapsed && "justify-center")}>
            <Avatar className={cn("h-9 w-9 shrink-0 ring-2", getRoleStyles(user.role).ring)}>
              <AvatarImage src={user.avatar_url ?? undefined} alt={user.full_name ?? user.email ?? "User"} />
              <AvatarFallback className={cn("text-xs font-semibold", getRoleStyles(user.role).avatar)}>
                {getInitials(user.full_name ?? user.email ?? "User")}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-white">{user.full_name}</p>
                  <p className={cn("truncate text-[10.5px] font-medium", sidebarRoleLabel[user.role] ?? "text-white/40")}>
                    {getRoleLabel(user.role)}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-white/35 hover:bg-white/5 hover:text-white"
                      onClick={logout}
                      aria-label="Log out"
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Log out</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
          {collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="mt-1 w-full text-white/40 hover:bg-white/5 hover:text-white"
                  onClick={logout}
                  aria-label="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Log out</TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  )
}
