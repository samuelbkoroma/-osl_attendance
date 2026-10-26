import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { drainQueuedOutbox } from "@/lib/email-outbox"

interface AbsentRow {
  employee_id: string
  employees: {
    full_name: string
    employee_no: string
    work_email: string | null
    user_id: string | null
  } | null
}

/**
 * Notifies the absent employees THEMSELVES that they missed the cutoff,
 * so each staff member who has not clocked in by 08:45 gets an in-app
 * notification (and a queued email) telling them to clock in or contact
 * their manager.
 *
 * The HR/line-manager chain alerts are queued separately by the
 * queue_missed_clockin_alerts SQL function; this covers the employee's
 * own inbox. Deduped: one notification per user per day (matched on
 * user_id + title + link) and one email per address per day (outbox
 * unique index on category + reference + to_email).
 */
async function notifyAbsentEmployees(
  admin: ReturnType<typeof createAdminClient>,
  workDate: string
): Promise<{ notified: number; work_date: string }> {
  const { data: settings } = await admin
    .from("org_settings")
    .select("hr_cutoff_time")
    .eq("id", 1)
    .maybeSingle()
  const cutoff = (settings?.hr_cutoff_time ?? "08:45").slice(0, 5)

  const { data: absentees, error } = await admin
    .from("attendance_records")
    .select("employee_id, employees(full_name, employee_no, work_email, user_id)")
    .eq("work_date", workDate)
    .eq("cutoff_status", "absent")

  if (error) throw error

  const title = "Missed clock-in — action needed"
  const link = "/employee/attendance"
  let notified = 0

  for (const row of (absentees ?? []) as unknown as AbsentRow[]) {
    const emp = row.employees
    if (!emp?.user_id) continue

    const body =
      `${emp.full_name} (${emp.employee_no}): you did not clock in by ${cutoff} ` +
      `Africa/Freetown time on ${workDate}. Please clock in now or contact your ` +
      `manager — your 08:45 status was recorded as absent.`

    // In-app notification — skip if it already exists for this user + day.
    const { data: existing } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", emp.user_id)
      .eq("title", title)
      .eq("link", link)
      .limit(1)
    if (existing && existing.length > 0) continue

    const { error: notifError } = await admin
      .from("notifications")
      .insert({ user_id: emp.user_id, title, body, link })
    if (notifError) {
      console.error("Self-alert notification failed:", notifError.message)
      continue
    }

    if (emp.work_email) {
      await admin
        .from("email_outbox")
        .upsert(
          {
            to_email: emp.work_email,
            subject: `Missed clock-in — ${emp.full_name} (${emp.employee_no}) — ${workDate}`,
            body_html:
              `<p>Dear ${emp.full_name},</p>` +
              `<p>Our records show you did not clock in by <strong>${cutoff}</strong> ` +
              `on ${workDate} (Africa/Freetown).</p>` +
              `<p>Please clock in as soon as possible, or contact your manager if you ` +
              `are on leave, on official duty or facing an emergency.</p>` +
              `<p style="color:#6b7280;font-size:12px;">Orange Sierra Leone — Attendance System</p>`,
            body_text: `Missed clock-in on ${workDate}: you did not clock in by ${cutoff}. Please clock in or contact your manager.`,
            category: "attendance.self_missed_cutoff",
            reference: `${row.employee_id}:${workDate}`,
          },
          { onConflict: "category,reference,to_email", ignoreDuplicates: true }
        )
    }

    notified++
  }

  return { notified, work_date: workDate }
}

// Invoked by the daily cron job (pg_cron / Vercel Cron / external scheduler).
// 1. Runs the 08:45 Africa/Freetown cutoff snapshot for today's date.
// 2. Queues missed-clock-in alerts for HR + the line-manager chain.
// 3. Notifies each absent employee themselves (in-app + queued email).
// 4. Queues the daily digest for HR directors.
// 5. Drains queued emails via Resend (no-op when not configured).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get("authorization")

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc("process_daily_cutoff", {
      p_date: null,
      p_force: false,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result = data as { skipped?: boolean; report_date?: string } | null
    const skipped = result?.skipped === true
    const workDate = result?.report_date ?? new Date().toISOString().slice(0, 10)

    let alerts: unknown = null
    let selfAlerts: unknown = null
    let digest: unknown = null

    if (!skipped) {
      const { data: queued, error: queueError } = await admin.rpc("queue_missed_clockin_alerts", {
        p_date: null,
      })
      if (queueError) {
        return NextResponse.json({ error: queueError.message }, { status: 500 })
      }
      alerts = queued

      selfAlerts = await notifyAbsentEmployees(admin, workDate)

      const { data: digestResult, error: digestError } = await admin.rpc("queue_daily_digest", {
        p_date: null,
      })
      if (digestError) {
        return NextResponse.json({ error: digestError.message }, { status: 500 })
      }
      digest = digestResult
    }

    const delivered = await drainQueuedOutbox(admin)

    return NextResponse.json({ success: true, result: data, alerts, self_alerts: selfAlerts, digest, email: delivered })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}
