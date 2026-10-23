// ============================================================================
// Transactional email delivery — server only.
//
// The 08:45 missed-clock-in alerts are queued in public.email_outbox by
// queue_missed_clockin_alerts() and drained by /api/cron/cutoff-report, which
// calls sendEmail() here.
//
// Two transports are supported and auto-selected:
//   1. SMTP via Nodemailer  — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
//   2. Resend HTTP API      — set RESEND_API_KEY
// SMTP wins when both are configured. When neither is configured the sender
// is a no-op that reports "skipped" so nothing is lost from the outbox.
// ============================================================================

import nodemailer, { type Transporter } from "nodemailer"

export interface OutboundEmail {
  to: string
  subject: string
  html: string
  text?: string | null
}

export interface SendResult {
  ok: boolean
  skipped?: boolean
  error?: string
  provider?: EmailProvider
}

export type EmailProvider = "smtp" | "resend" | "none"

const RESEND_ENDPOINT = "https://api.resend.com/emails"

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "Orange SL Attendance <no-reply@orangesl.demo>"
}

function smtpConfigured(): boolean {
  return !!process.env.SMTP_HOST
}

function resendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

export function getEmailProvider(): EmailProvider {
  if (smtpConfigured()) return "smtp"
  if (resendConfigured()) return "resend"
  return "none"
}

export function isEmailConfigured(): boolean {
  return getEmailProvider() !== "none"
}

let cachedTransport: Transporter | null = null

function smtpTransport(): Transporter {
  if (cachedTransport) return cachedTransport
  const port = Number(process.env.SMTP_PORT ?? 587)
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  })
  return cachedTransport
}

/** Sends one email. Never throws — returns a structured result. */
export async function sendEmail(email: OutboundEmail): Promise<SendResult> {
  const provider = getEmailProvider()

  if (provider === "none") {
    return { ok: false, skipped: true, provider, error: "No email provider configured" }
  }

  if (provider === "smtp") {
    try {
      const info = await smtpTransport().sendMail({
        from: fromAddress(),
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text ?? undefined,
      })
      if (info.rejected && info.rejected.length > 0) {
        return { ok: false, provider, error: `Rejected: ${info.rejected.join(", ")}` }
      }
      return { ok: true, provider }
    } catch (err) {
      return {
        ok: false,
        provider,
        error: err instanceof Error ? err.message : "Unknown SMTP send error",
      }
    }
  }

  // provider === "resend"
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text ?? undefined,
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      return { ok: false, provider, error: `Resend ${res.status}: ${detail.slice(0, 300)}` }
    }
    return { ok: true, provider }
  } catch (err) {
    return {
      ok: false,
      provider,
      error: err instanceof Error ? err.message : "Unknown send error",
    }
  }
}
