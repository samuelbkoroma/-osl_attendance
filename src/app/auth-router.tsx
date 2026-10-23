"use client"

import React from "react"
import { useAuth } from "@/providers/auth-provider"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { homeForRole } from "@/lib/navigation"

export function AuthRouter() {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (user) {
      router.replace(user.must_change_password ? "/change-password" : homeForRole(user.role))
    } else {
      router.replace("/login")
    }
  }, [user, isLoading, router])

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  )
}
