import type { SupabaseClient } from "@supabase/supabase-js"
import { isEmailConfigured, sendEmail } from "@/lib/email"
import type { EmailOutboxItem } from "@/types"

export interface DrainSummary {
  configured: boolean
  sent: number
  failed: number
  skipped: number
}

export function emptyDrainSummary(): DrainSummary {
  return { configured: isEmailConfigured(), sent: 0, failed: 0, skipped: 0 }
}

/** Sends the supplied outbox rows, marking each one sent or failed. */
export async function deliverOutboxRows(
  admin: SupabaseClient,
  rows: EmailOutboxItem[]
): Promise<DrainSummary> {
  const summary = emptyDrainSummary()

  for (const item of rows) {
    const result = await sendEmail({
      to: item.to_email,
      subject: item.subject,
      html: item.body_html,
      text: item.body_text,
    })

    if (result.ok) {
      await admin.rpc("mark_email_sent", { p_id: item.id })
      summary.sent += 1
    } else if (result.skipped) {
      summary.skipped += 1
    } else {
      await admin.rpc("mark_email_failed", {
        p_id: item.id,
        p_error: result.error ?? "send failed",
      })
      summary.failed += 1
    }
  }

  return summary
}

/** Claims and sends everything currently queued (cron fallback). */
export async function drainQueuedOutbox(
  admin: SupabaseClient,
  limit = 100
): Promise<DrainSummary> {
  const summary = emptyDrainSummary()
  const { data: queued, error } = await admin.rpc("claim_queued_emails", { p_limit: limit })
  if (error || !queued) return summary

  const delivered = await deliverOutboxRows(admin, queued as EmailOutboxItem[])
  summary.sent = delivered.sent
  summary.failed = delivered.failed
  summary.skipped = delivered.skipped
  return summary
}
