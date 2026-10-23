import type { UserRole } from "@/types"

export const ROLE_HOME: Record<UserRole, string> = {
  super_admin: "/hr",
  hr_admin: "/hr",
  hr_officer: "/hr",
  branch_manager: "/manager",
  employee: "/employee",
}

export function homeForRole(role: string | null | undefined): string {
  if (!role) return "/login"
  return ROLE_HOME[role as UserRole] ?? "/employee"
}

export function isHrRole(role: string | null | undefined): boolean {
  return role === "super_admin" || role === "hr_admin" || role === "hr_officer"
}

export function canManageSettings(role: string | null | undefined): boolean {
  return role === "super_admin" || role === "hr_admin"
}

export function canReviewRequests(role: string | null | undefined): boolean {
  return isHrRole(role) || role === "branch_manager"
}
