import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { deliverOutboxRows } from "@/lib/email-outbox"
import type { EmailOutboxItem } from "@/types"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      event?: string
      work_date?: string
    }
    const event = body.event === "check_out" ? "check_out" : "check_in"
    const admin = createAdminClient()

    const { data: employee } = await admin
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
    if (!employee) {
      return NextResponse.json({ error: "Employee record not found" }, { status: 403 })
    }

    let workDate = body.work_date
    if (!workDate) {
      const { data: settings } = await admin
        .from("org_settings")
        .select("timezone")
        .eq("id", 1)
        .maybeSingle()
      workDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: settings?.timezone ?? "Africa/Freetown",
      }).format(new Date())
    }

    const { data: record } = await admin
      .from("attendance_records")
      .select("id")
      .eq("employee_id", employee.id)
      .eq("work_date", workDate)
      .maybeSingle()
    if (!record) {
      return NextResponse.json({ success: true, queued: 0, sent: 0 })
    }

    const reference = `${employee.id}:${workDate}:${event}`
    const { data: rows, error } = await admin
      .from("email_outbox")
      .select("*")
      .eq("reference", reference)
      .eq("status", "queued")
      .limit(25)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const delivered = await deliverOutboxRows(admin, (rows ?? []) as EmailOutboxItem[])
    return NextResponse.json({ success: true, queued: rows?.length ?? 0, ...delivered })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}
