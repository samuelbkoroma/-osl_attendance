import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { drainQueuedOutbox } from "@/lib/email-outbox"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle()
    if (!profile?.is_active || !["super_admin", "hr_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: string
      all_failed?: boolean
    }
    const admin = createAdminClient()

    let query = admin
      .from("email_outbox")
      .update({ status: "queued", attempts: 0, last_error: null })
      .eq("status", "failed")
    if (!body.all_failed) {
      if (!body.id) {
        return NextResponse.json({ error: "Missing email id" }, { status: 400 })
      }
      query = query.eq("id", body.id)
    }

    const { data: reset, error } = await query.select("id")
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const delivered = await drainQueuedOutbox(admin, 200)
    return NextResponse.json({
      success: true,
      reset: reset?.length ?? 0,
      email: delivered,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}
