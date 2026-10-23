import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: NextRequest) {
  try {
    const { identifier, password } = await request.json()

    if (!identifier || !password) {
      return NextResponse.json({ error: "Employee ID / email and password are required" }, { status: 400 })
    }

    const trimmed = identifier.trim()
    const isEmail = trimmed.includes("@")

    const adminSupabase = createAdminClient()
    const cookieStore = request.cookies
    const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = []

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookies) {
            cookiesToSet.push(...cookies)
          },
        },
      }
    )

    let email = isEmail ? trimmed : ""

    if (!email) {
      const { data: employee } = await adminSupabase
        .from("employees")
        .select("work_email")
        .eq("employee_no", trimmed.toUpperCase())
        .maybeSingle()

      email = (employee as { work_email: string | null } | null)?.work_email ?? ""

      if (!email) {
        const { data: matches } = await adminSupabase
          .from("employees")
          .select("work_email")
          .ilike("full_name", `%${trimmed}%`)
          .limit(1)
        email = (matches?.[0] as { work_email: string | null } | undefined)?.work_email ?? ""
      }

      if (!email) {
        return NextResponse.json(
          { error: "No account found with that employee ID or email" },
          { status: 404 }
        )
      }
    }

    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("is_active, must_change_password")
      .eq("email", email)
      .maybeSingle()

    if (profile && (profile as { is_active: boolean }).is_active === false) {
      return NextResponse.json(
        { error: "This account has been deactivated. Contact your HR administrator." },
        { status: 403 }
      )
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    const response = NextResponse.json({
      success: true,
      mustChangePassword: (profile as { must_change_password: boolean } | null)?.must_change_password ?? false,
    })
    for (const { name, value, options } of cookiesToSet) {
      response.cookies.set(name, value, options)
    }

    return response
  } catch {
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
