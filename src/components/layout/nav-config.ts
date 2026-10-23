import type React from "react"
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  History,
  LayoutDashboard,
  Settings,
  UserCircle,
  Users,
  UsersRound,
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  description?: string
  exact?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

const accountItems: NavItem[] = [
  { label: "Notifications", href: "/notifications", icon: Bell, description: "Alerts and updates" },
  { label: "My Profile", href: "/profile", icon: UserCircle, description: "Your details and security" },
]

const employeeGroups: NavGroup[] = [
  {
    label: "Everyday",
    items: [
      {
        label: "Dashboard",
        href: "/employee",
        icon: LayoutDashboard,
        description: "Today at a glance",
        exact: true,
      },
      {
        label: "My Attendance",
        href: "/employee/attendance",
        icon: History,
        description: "History, exports and fixes",
      },
      {
        label: "Leave Requests",
        href: "/employee/leave",
        icon: CalendarDays,
        description: "Apply and track approvals",
      },
    ],
  },
  { label: "Account", items: accountItems },
]

const hrGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Cutoff Dashboard",
        href: "/hr",
        icon: ClipboardList,
        description: "08:45 snapshot and alerts",
        exact: true,
      },
      {
        label: "Attendance",
        href: "/hr/attendance",
        icon: ClipboardCheck,
        description: "Search, amend and export records",
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        label: "Employees",
        href: "/hr/employees",
        icon: Users,
        description: "Records, roles and accounts",
      },
      {
        label: "Leave Requests",
        href: "/hr/leave",
        icon: CalendarDays,
        description: "Approve or decline leave",
      },
      {
        label: "Corrections",
        href: "/hr/corrections",
        icon: FileClock,
        description: "Fix missed clock-ins",
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        label: "My Attendance",
        href: "/employee",
        icon: History,
        description: "Your own clock-ins",
        exact: true,
      },
      ...accountItems,
    ],
  },
  {
    label: "Admin",
    items: [
      {
        label: "Settings",
        href: "/hr/settings",
        icon: Settings,
        description: "Org, branches and schedules",
      },
    ],
  },
]

const managerGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Branch Dashboard",
        href: "/manager",
        icon: LayoutDashboard,
        description: "Today's team status",
        exact: true,
      },
      {
        label: "My Team",
        href: "/manager/team",
        icon: UsersRound,
        description: "Everyone in your branch",
      },
    ],
  },
  {
    label: "Reviews",
    items: [
      {
        label: "Leave Requests",
        href: "/manager/leave",
        icon: CalendarDays,
        description: "Approve or decline leave",
      },
      {
        label: "Corrections",
        href: "/manager/corrections",
        icon: FileClock,
        description: "Fix team clock-ins",
      },
    ],
  },
  {
    label: "Everyday",
    items: [
      {
        label: "My Attendance",
        href: "/employee",
        icon: History,
        description: "Your own clock-ins",
        exact: true,
      },
      ...accountItems,
    ],
  },
]

export function getNavGroups(role: string | null | undefined): NavGroup[] {
  switch (role) {
    case "hr_admin":
    case "super_admin":
      return hrGroups
    case "hr_officer":
      return hrGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.href !== "/hr/settings"),
        }))
        .filter((group) => group.items.length > 0)
    case "branch_manager":
      return managerGroups
    default:
      return employeeGroups
  }
}

export interface MobileNavItem {
  label: string
  href: string
  icon: React.ElementType
  exact?: boolean
}

export function getMobileNav(role: string | null | undefined): MobileNavItem[] {
  if (role === "hr_admin" || role === "super_admin" || role === "hr_officer") {
    return [
      { label: "Home", href: "/hr", icon: LayoutDashboard, exact: true },
      { label: "Attendance", href: "/hr/attendance", icon: ClipboardCheck },
      { label: "People", href: "/hr/employees", icon: Users },
      { label: "Leave", href: "/hr/leave", icon: CalendarDays },
    ]
  }
  if (role === "branch_manager") {
    return [
      { label: "Branch", href: "/manager", icon: LayoutDashboard, exact: true },
      { label: "Leave", href: "/manager/leave", icon: CalendarDays },
      { label: "Fixes", href: "/manager/corrections", icon: FileClock },
      { label: "Me", href: "/employee", icon: History, exact: true },
    ]
  }
  return [
    { label: "Home", href: "/employee", icon: LayoutDashboard, exact: true },
    { label: "Attendance", href: "/employee/attendance", icon: History },
    { label: "Leave", href: "/employee/leave", icon: CalendarDays },
    { label: "Alerts", href: "/notifications", icon: Bell },
  ]
}

export function isNavItemActive(pathname: string, item: Pick<NavItem, "href" | "exact">, home: string): boolean {
  if (pathname === item.href) return true
  if (item.exact) return false
  if (item.href === home) return false
  return pathname.startsWith(`${item.href}/`)
}
