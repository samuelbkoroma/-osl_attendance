import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

interface KioskEmployee {
  id: string
  employee_no: string
  full_name: string
  job_title: string | null
  profile: { avatar_url: string | null } | null
  branch: { id: string; name: string } | null
}

interface KioskRecord {
  check_in?: string | null
  check_out?: string | null
  status?: string | null
  minutes_late?: number | null
}

interface KioskRpcResult {
  success?: boolean
  action?: string
  record?: KioskRecord | null
}

/**
 * Branch Kiosk Terminal — a physical/shared terminal at a branch.
 * The QR badge encodes {id, no}; staff can also type their employee number.
 *
 * The actual write goes through public.kiosk_record_attendance (service-role)
 * so classification stays in sync with compute_attendance_status().
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      employee_id,
      employee_no,
      raw_payload,
      action = "check_in",
      branch_id,
    } = body ?? {}

    let resolvedId = employee_id as string | undefined
    let resolvedNo = employee_no as string | undefined

    if (raw_payload) {
      const payloadStr = String(raw_payload).trim()
      try {
        const parsed = JSON.parse(payloadStr)
        if (parsed?.id) resolvedId = parsed.id
        if (parsed?.no) resolvedNo = parsed.no
      } catch {
        // Fallback: the QR or keypad may be just the employee number.
        resolvedNo = payloadStr
      }
    }

    if (!resolvedId && !resolvedNo) {
      return NextResponse.json({ error: "Employee identifier required" }, { status: 400 })
    }

    // Check if there's a logged-in operator (e.g. HR or Branch Manager)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const operatorId = user?.id || null

    const admin = createAdminClient()

    // Resolve the employee (id takes precedence if both are somehow sent).
    let empQuery = admin
      .from("employees")
      .select("id, employee_no, full_name, job_title, profile:profiles(avatar_url), branch:branches(id, name)")
    if (resolvedId) {
      empQuery = empQuery.eq("id", resolvedId)
    } else if (resolvedNo) {
      empQuery = empQuery.eq("employee_no", resolvedNo)
    }

    const { data: employeeRow, error: empErr } = await empQuery.maybeSingle()
    const employee = employeeRow as KioskEmployee | null

    if (empErr || !employee) {
      return NextResponse.json({ error: "Employee not found or inactive" }, { status: 404 })
    }

    // Call the service-role RPC which enforces business rules and writes the
    // attendance row with source='kiosk'.
    const { data: rpcResult, error: rpcErr } = await admin.rpc("kiosk_record_attendance", {
      p_employee_id: employee.id,
      p_branch_id: branch_id || null,
      p_action: action === "check_out" ? "check_out" : "check_in",
      p_operator_id: operatorId,
    })

    if (rpcErr) {
      // The terminal UX treats "already checked in" as a friendly message
      // rather than a hard error so the staff know what to do next.
      const msg = rpcErr.message || ""
      if (action === "check_in" && /already checked in/i.test(msg)) {
        // Pull today's record for display.
        const { data: settings } = await admin.from("org_settings").select("timezone").eq("id", 1).maybeSingle()
        const tz = settings?.timezone ?? "Africa/Freetown"
        const todayStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date())
        const { data: record } = await admin
          .from("attendance_records")
          .select("check_in, check_out, status, minutes_late")
          .eq("employee_id", employee.id)
          .eq("work_date", todayStr)
          .maybeSingle()

        return NextResponse.json({
          success: true,
          action: "already_checked_in",
          message: msg,
          employee: {
            id: employee.id,
            employee_no: employee.employee_no,
            full_name: employee.full_name,
            job_title: employee.job_title,
            avatar_url: employee.profile?.avatar_url ?? null,
            branch_name: employee.branch?.name ?? null,
          },
          record,
        })
      }
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const result = rpcResult as KioskRpcResult | null
    const record = result?.record ?? null

    return NextResponse.json({
      success: true,
      action: result?.action ?? action,
      employee: {
        id: employee.id,
        employee_no: employee.employee_no,
        full_name: employee.full_name,
        job_title: employee.job_title,
        avatar_url: employee.profile?.avatar_url ?? null,
        branch_name: employee.branch?.name ?? null,
      },
      record,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}
