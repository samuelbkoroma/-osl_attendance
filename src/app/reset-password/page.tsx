"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, CheckCircle2, Eye, EyeOff } from "lucide-react"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let active = true
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && active) {
        setReady(true)
        setChecking(false)
      }
    })
    supabase.auth
      .getSession()
      .then(({ data: sessionData }) => {
        if (active) setReady(!!sessionData.session)
      })
      .catch(() => {
        if (active) setReady(false)
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (password.length < 8) {
      setError("Use at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("The passwords do not match.")
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password.")
    } finally {
      setLoading(false)
    }
  }

  const signIn = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace("/login")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <div className="pointer-events-none fixed -right-32 -top-32 h-72 w-72 rounded-full bg-primary/[0.07] blur-3xl" />
      <div className="relative w-full max-w-md space-y-5">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 overflow-hidden rounded-2xl shadow-lg shadow-primary/25">
            <Image src="/logo.png" alt="Orange" width={64} height={64} priority />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Orange Sierra Leone</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Workforce Attendance Management</p>
        </div>

        <Card className="border-primary/10 shadow-xl shadow-primary/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Choose a new password</CardTitle>
            <CardDescription>Pick something you haven&apos;t used before.</CardDescription>
          </CardHeader>
          <CardContent>
            {checking ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Verifying your link…
              </div>
            ) : done ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-[13px] text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Password updated</p>
                    <p className="mt-0.5 text-[12px] leading-5 text-emerald-700">
                      You can now sign in with your new password.
                    </p>
                  </div>
                </div>
                <Button className="w-full" onClick={signIn}>
                  Continue to sign in
                </Button>
              </div>
            ) : !ready ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[13px] text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">This link is invalid or has expired</p>
                    <p className="mt-0.5 text-[12px] leading-5 text-amber-700">
                      Request a fresh reset email and open the newest link.
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/forgot-password">Request another link</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.07] p-3 text-[13px] text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 pr-11"
                      autoComplete="new-password"
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
                  <p className="text-[11.5px] text-muted-foreground">At least 8 characters.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="h-11"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <Button type="submit" className="h-11 w-full" disabled={loading}>
                  {loading ? "Updating…" : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
