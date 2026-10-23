import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const nextParam = url.searchParams.get("next")
  const next = nextParam === "/reset-password" ? nextParam : "/reset-password"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const failed = NextResponse.redirect(new URL("/forgot-password?error=expired", url.origin))
      return failed
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
