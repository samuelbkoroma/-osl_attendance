import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { homeForRole, isHrRole, canManageSettings } from "@/lib/navigation"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isLoginPage = pathname === "/login"
  const isPublicPage =
    isLoginPage ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/auth/callback"
  const isApiRoute = pathname.startsWith("/api/")
  const role = (user?.user_metadata as { role?: string } | null)?.role
  const home = homeForRole(role)

  if (!user) {
    if (isPublicPage || isApiRoute) return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (isApiRoute) return supabaseResponse

  if (isLoginPage || pathname === "/forgot-password") {
    const url = request.nextUrl.clone()
    url.pathname = home
    return NextResponse.redirect(url)
  }

  if (pathname === "/") {
    const url = request.nextUrl.clone()
    url.pathname = home
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith("/hr") && !isHrRole(role)) {
    const url = request.nextUrl.clone()
    url.pathname = home
    return NextResponse.redirect(url)
  }

  // System settings expose organisation rules, branch geofences, schedules and
  // the audit trail. Every write there is guarded by is_hr_admin() in RLS, so
  // an hr_officer would only see a form that always fails. Restrict the route
  // itself to the roles that can actually save.
  if (pathname.startsWith("/hr/settings") && !canManageSettings(role)) {
    const url = request.nextUrl.clone()
    url.pathname = "/hr"
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith("/manager") && !isHrRole(role) && role !== "branch_manager") {
    const url = request.nextUrl.clone()
    url.pathname = home
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
