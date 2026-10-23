import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { drainQueuedOutbox } from "@/lib/email-outbox"

// Invoked by the daily cron job (pg_cron / Vercel Cron / external scheduler).
// 1. Runs the 08:45 Africa/Freetown cutoff snapshot for today's date.
// 2. Queues missed-clock-in alerts (HR director + line-manager chain).
// 3. Drains queued emails via Resend (no-op when not configured).
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

    const skipped = (data as { skipped?: boolean } | null)?.skipped === true

    let alerts: unknown = null
    if (!skipped) {
      const { data: queued, error: queueError } = await admin.rpc("queue_missed_clockin_alerts", {
        p_date: null,
      })
      if (queueError) {
        return NextResponse.json({ error: queueError.message }, { status: 500 })
      }
      alerts = queued
    }

    let digest: unknown = null
    if (!skipped) {
      const { data: digestResult, error: digestError } = await admin.rpc("queue_daily_digest", {
        p_date: null,
      })
      if (digestError) {
        return NextResponse.json({ error: digestError.message }, { status: 500 })
      }
      digest = digestResult
    }

    const delivered = await drainQueuedOutbox(admin)

    return NextResponse.json({ success: true, result: data, alerts, digest, email: delivered })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}

