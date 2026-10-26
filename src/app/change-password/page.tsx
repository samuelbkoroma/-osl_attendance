"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { useAuth } from "@/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Callout } from "@/components/ui/callout"
import { CheckCircle2, XCircle, Loader2, Eye, EyeOff, Check, Circle, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { homeForRole } from "@/lib/navigation"

function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-1.5 text-[11.5px]", met ? "text-emerald-600" : "text-muted-foreground")}>
      {met ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}
      {children}
    </li>
  )
}

export default function ChangePasswordPage() {
  const router = useRouter()
  const { user, isLoading, refreshSession } = useAuth()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login")
    }
  }, [isLoading, user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.")
      return
    }
    if (newPassword.length < 6) {
      setError("Your new password must be at least 6 characters.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess(true)
        // Pull must_change_password:false + latest role into the auth context,
        // then navigate straight to this user's dashboard — no timer, no
        // full-page refresh through "/".
        const profile = await refreshSession()
        router.replace(homeForRole(profile?.role ?? user?.role))
      } else {
        setError(data.error || "Failed to change password")
      }
    } catch {
      setError("Network error. Check your connection and try again.")
    }
    setSubmitting(false)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const needsChange = user?.must_change_password

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-orange-50 via-background to-orange-50/30 p-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-primary/[0.07] blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/[0.07] blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-5">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 overflow-hidden rounded-2xl shadow-lg shadow-primary/25">
            <Image src="/logo.png" alt="Orange" width={64} height={64} priority />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Orange Sierra Leone</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {needsChange ? "Set a password to continue" : "Account security"}
          </p>
        </div>

        <Card className="border-primary/10 shadow-xl shadow-primary/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">{needsChange ? "Choose your password" : "Change password"}</CardTitle>
            <CardDescription>
              {needsChange
                ? "Your temporary password must be replaced before you can continue."
                : user
                  ? `Account: ${user.email}`
                  : "Sign in to change your password"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="space-y-3 py-2 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Password updated</p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    Taking you to your dashboard…
                  </p>
                </div>
                <div className="flex justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.07] p-3 text-[13px] text-destructive">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="cpCurrent">Current password</Label>
                  <div className="relative">
                    <Input
                      id="cpCurrent"
                      type={showCurrent ? "text" : "password"}
                      placeholder={needsChange ? "Your temporary password" : "Enter your current password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="h-11 pr-11"
                      autoComplete="current-password"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowCurrent((v) => !v)}
                      aria-label={showCurrent ? "Hide password" : "Show password"}
                    >
                      {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cpNew">New password</Label>
                  <div className="relative">
                    <Input
                      id="cpNew"
                      type={showNew ? "text" : "password"}
                      placeholder="At least 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-11 pr-11"
                      autoComplete="new-password"
                      required
                      minLength={6}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNew((v) => !v)}
                      aria-label={showNew ? "Hide password" : "Show password"}
                    >
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cpConfirm">Confirm new password</Label>
                  <Input
                    id="cpConfirm"
                    type={showNew ? "text" : "password"}
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11"
                    autoComplete="new-password"
                    required
                    minLength={6}
                  />
                </div>

                <ul className="space-y-1.5 rounded-xl border bg-muted/30 p-3">
                  <Requirement met={newPassword.length >= 6}>At least 6 characters</Requirement>
                  <Requirement met={newPassword.length > 0 && newPassword === confirmPassword}>
                    Both new passwords match
                  </Requirement>
                </ul>

                <Callout variant="tip" icon={ShieldCheck}>
                  Use something only you would know. Avoid your staff ID, phone number or “password”.
                </Callout>

                <Button type="submit" className="h-11 w-full" disabled={submitting}>
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      Updating…
                    </span>
                  ) : (
                    "Update password"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
