import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Approve or reject a leave / attendance-correction request.
 *
 * The decision itself is made by the database (review_leave_request /
 * review_correction_request) so the permission rules, the attendance rows it
 * writes and the audit trail all live in one place. The route only decides
 * which function to call.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const {
      type, // "leave" | "correction"
      requestId,
      decision, // "approved" | "rejected"
      notes = null,
    } = body ?? {}

    if (!type || !requestId || !decision) {
      return NextResponse.json({ error: "Missing required fields (type, requestId, decision)" }, { status: 400 })
    }

    if (type !== "leave" && type !== "correction") {
      return NextResponse.json({ error: "Invalid request type" }, { status: 400 })
    }

    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json({ error: "Decision must be 'approved' or 'rejected'" }, { status: 400 })
    }

    const fn = type === "leave" ? "review_leave_request" : "review_correction_request"

    // The session client is used on purpose: the RPC checks the caller's role
    // and branch scope through auth.uid(), so RLS cannot be bypassed here.
    const { data, error } = await supabase.rpc(fn, {
      p_request_id: requestId,
      p_decision: decision,
      p_notes: notes,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, request: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}
