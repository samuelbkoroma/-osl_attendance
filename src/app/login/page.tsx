"use client"

import React, { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { useAuth } from "@/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Eye, EyeOff, Clock3, MapPin, ShieldCheck, AlertTriangle, HelpCircle } from "lucide-react"
import { homeForRole } from "@/lib/navigation"

const highlights = [
  {
    icon: Clock3,
    title: "Clock in from your phone",
    body: "One tap records your time and shows your full day.",
  },
  {
    icon: MapPin,
    title: "Location-aware",
    body: "Check-ins are verified against your branch when required.",
  },
  {
    icon: ShieldCheck,
    title: "Fix mistakes easily",
    body: "Request a correction without filling in paperwork.",
  },
]

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const router = useRouter()
  const { refreshSession, user } = useAuth()
  const redirectAttempted = useRef(false)

  useEffect(() => {
    if (user && isRedirecting && !redirectAttempted.current) {
      redirectAttempted.current = true
      router.replace(
        mustChangePassword || user.must_change_password
          ? "/change-password"
          : homeForRole(user.role)
      )
    }
  }, [user, isRedirecting, mustChangePassword, router])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError("")
      setIsLoading(true)
      redirectAttempted.current = false

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: identifier.trim(), password }),
        })
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || "Login failed")
          setIsLoading(false)
          return
        }

        setMustChangePassword(!!data.mustChangePassword)
        setIsLoading(false)
        setIsRedirecting(true)
        await refreshSession()
      } catch {
        setError("Network error. Check your connection and try again.")
        setIsLoading(false)
        setIsRedirecting(false)
      }
    },
    [identifier, password, refreshSession]
  )

  if (isRedirecting && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-primary to-orange-600 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-black/10 blur-3xl" />
        </div>

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="overflow-hidden rounded-2xl bg-white p-1.5 shadow-lg">
              <Image src="/logo.png" alt="Orange" width={48} height={48} priority />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">Orange Sierra Leone</p>
              <p className="text-[11px] text-white/75">Workforce Attendance</p>
            </div>
          </div>

          <div className="mt-16 max-w-md">
            <h2 className="text-3xl font-bold leading-tight tracking-tight">
              Your workday, made simple.
            </h2>
            <p className="mt-3 text-[14px] leading-6 text-white/80">
              Clock in, follow your month, and sort out any attendance issues — all in one place.
            </p>
          </div>

          <div className="mt-10 space-y-5">
            {highlights.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                  <item.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[13.5px] font-semibold">{item.title}</p>
                  <p className="text-[12.5px] leading-5 text-white/75">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] text-white/60">
          © {new Date().getFullYear()} Orange Sierra Leone. Internal use only.
        </p>
      </aside>

      <main className="relative flex min-h-screen items-center justify-center p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-32 -top-32 h-72 w-72 rounded-full bg-primary/[0.06] blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-72 w-72 rounded-full bg-primary/[0.06] blur-3xl" />
        </div>

        <div className="relative w-full max-w-md space-y-5">
          <div className="flex flex-col items-center text-center lg:hidden">
            <div className="mb-3 overflow-hidden rounded-2xl shadow-lg shadow-primary/25">
              <Image src="/logo.png" alt="Orange" width={64} height={64} priority />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Orange Sierra Leone</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Workforce Attendance Management</p>
          </div>

          <Card className="border-primary/10 shadow-xl shadow-primary/5">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>Sign in with your staff ID or work email.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.07] p-3 text-[13px] text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="identifier">Staff ID or email</Label>
                  <Input
                    id="identifier"
                    placeholder="e.g. OSL-00001 or you@orange.sl"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="h-11"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="/forgot-password"
                      className="text-[11.5px] font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
                      className="h-11 pr-11"
                      autoComplete="current-password"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {capsLock && (
                    <p className="flex items-center gap-1.5 text-[11.5px] text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Caps Lock is on.
                    </p>
                  )}
                </div>

                <Button type="submit" className="h-11 w-full" disabled={isLoading}>
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      Signing in…
                    </span>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>

              <div className="mt-4 rounded-xl border border-border/70 bg-muted/40 p-3 text-[11.5px] leading-5 text-muted-foreground">
                <span className="font-semibold text-foreground">First time here?</span> Use the staff ID and temporary
                password from your HR administrator. You will be asked to set your own password.
              </div>
            </CardContent>
          </Card>

          <div className="flex items-start justify-center gap-2 text-center text-[11.5px] text-muted-foreground">
            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Trouble signing in? Contact your HR administrator or branch manager — they can reset your temporary
              password.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
