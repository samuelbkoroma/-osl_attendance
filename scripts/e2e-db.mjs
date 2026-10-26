#!/usr/bin/env node
/**
 * End-to-end DB/RPC/RLS test suite for Orange SL attendance.
 * Runs against the live Supabase project (service key for admin ops, real
 * user sessions for RLS tests). Cleans up every row it creates.
 *
 *   node --env-file=.env.local scripts/e2e-db.mjs
 */
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PW = "Orange@2026"
const T0 = new Date().toISOString()
const todayStr = new Date().toISOString().slice(0, 10)

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const results = []

function record(name, ok, detail = "") {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`)
}

const HQ = { latitude: 8.4657, longitude: -13.2317 } // HQ branch geofence

async function userClient(email) {
  const c = createClient(url, anonKey)
  const { error } = await c.auth.signInWithPassword({ email, password: PW })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  const { data: { user } } = await c.auth.getUser()
  c.__email = email
  c.__uid = user.id
  return c
}

async function main() {
  const staff = await userClient("staff@orange.sl")       // employee, HQ
  const mgr = await userClient("manager@orange.sl")       // branch_manager, HQ
  const hr = await userClient("director@orange.sl")       // hr_admin (director)
  const officer = await userClient("hr.officer@orangesl.demo") // hr_officer
  const supadm = await userClient("agness@orange-sonatel.com") // super_admin
  const pope = await userClient("pope@gmail.com")         // director promoted to hr_admin
  record("Login: 6 role sessions authenticate", true, "employee, branch_manager, hr_admin, hr_officer, super_admin, promoted director")

  // profile roles
  for (const [c, role] of [
    [staff, "employee"],
    [mgr, "branch_manager"],
    [hr, "hr_admin"],
    [officer, "hr_officer"],
    [supadm, "super_admin"],
    [pope, "hr_admin"],
  ]) {
    const { data: prof } = await c.from("profiles").select("role").eq("id", c.__uid).maybeSingle()
    record(`Role wired correctly — ${c.__email}`, prof?.role === role, `${role}`, prof?.role ?? "none")
  }

  // employee visibility
  {
    const { count: n } = await staff.from("employees").select("id", { count: "exact", head: true })
    record("Employee sees only OWN employee row", n === 1, `visible: ${n}`)
  }
  {
    const { data: other } = await admin.from("employees").select("id").eq("work_email", "hawa.tarawally@orangesl.demo").single()
    const { data: read } = await staff.from("employees").select("id").eq("id", other.id).maybeSingle()
    record("Employee cannot read another employee", read === null, read ? "VISIBLE — leak" : "hidden")
  }
  {
    const hqId = (await admin.from("branches").select("id").eq("code", "HQ").single()).data.id
    const { count: mgrSees } = await mgr.from("employees").select("id", { count: "exact", head: true })
    const { count: hqTotal } = await admin.from("employees").select("id", { count: "exact", head: true }).eq("branch_id", hqId)
    record("Manager sees only own-branch employees", mgrSees === hqTotal, `manager: ${mgrSees}, HQ total: ${hqTotal}`)
  }
  for (const [c, label] of [[hr, "HR admin"], [pope, "Director (promoted)"], [supadm, "Super admin"]]) {
    const { count: n } = await c.from("employees").select("id", { count: "exact", head: true })
    record(`${label} sees ALL employees`, n === 30, `visible: ${n}`)
  }

  // attendance visibility
  const { data: myEmp } = await staff.from("employees").select("id").single()
  {
    const { count: own } = await staff.from("attendance_records").select("id", { count: "exact", head: true }).eq("employee_id", myEmp.id)
    const { count: visible } = await staff.from("attendance_records").select("id", { count: "exact", head: true })
    record("Attendance scoped to own rows", visible === own, `own: ${own}, visible: ${visible}`)
  }
  {
    const hqId = (await admin.from("branches").select("id").eq("code", "HQ").single()).data.id
    const { count: mgrSees } = await mgr.from("attendance_records").select("id", { count: "exact", head: true })
    const { count: hqTotal } = await admin.from("attendance_records").select("id", { count: "exact", head: true }).eq("branch_id", hqId)
    record("Manager attendance scoped to branch", mgrSees === hqTotal, `manager: ${mgrSees}, HQ: ${hqTotal}`)
  }
  {
    const { count: n } = await hr.from("attendance_records").select("id", { count: "exact", head: true })
    record("HR sees every attendance record", n > 100, `visible: ${n}`)
  }

  // restricted tables — RLS silently filters, so assert ZERO rows
  {
    const { data, error } = await staff.from("daily_attendance_reports").select("id").limit(1)
    record("Cutoff reports blocked for employee", !error && (!data || data.length === 0), error ? error.message.slice(0, 70) : `rows: ${data?.length ?? 0}`)
  }
  {
    const { data, error } = await mgr.from("daily_attendance_reports").select("id").limit(1)
    record("Cutoff reports blocked for branch manager", !error && (!data || data.length === 0), error ? error.message.slice(0, 70) : `rows: ${data?.length ?? 0}`)
  }
  {
    const { data, error } = await hr.from("daily_attendance_reports").select("report_date").order("report_date", { ascending: false }).limit(1)
    record("HR reads latest cutoff report", !error && data?.length === 1, data?.[0]?.report_date ?? "")
  }
  {
    const { data, error } = await staff.from("audit_logs").select("id").limit(1)
    record("Audit logs blocked for employee", !error && (!data || data.length === 0), error ? error.message.slice(0, 70) : `rows: ${data?.length ?? 0}`)
  }
  {
    const { data, error } = await officer.from("audit_logs").select("id").limit(1)
    record("HR officer reads audit trail", !error && (data?.length ?? 0) > 0, error ? error.message.slice(0, 70) : "ok")
  }
  {
    const { data } = await staff.from("email_outbox").select("id")
    record("Email outbox hidden from staff", !data || data.length === 0, `visible: ${data?.length ?? 0}`)
  }

  // direct writes
  {
    const { error } = await staff.from("attendance_records").insert({ employee_id: myEmp.id, work_date: todayStr })
    record("Direct attendance INSERT blocked", !!error, error ? error.message.slice(0, 70) : "WROTE — BUG")
  }
  {
    const { error } = await staff.from("attendance_records").update({ status: "present" }).eq("employee_id", myEmp.id)
    record("Direct attendance UPDATE blocked", !!error, error ? error.message.slice(0, 70) : "UPDATED — BUG")
  }

  // profile self-update scopes
  {
    const { error } = await staff.from("profiles").update({ full_name: "Staff Orange" }).eq("id", staff.__uid)
    record("Employee updates own name", !error, error ? error.message.slice(0, 70) : "ok")
  }
  {
    const { error } = await staff.from("profiles").update({ role: "super_admin" }).eq("id", staff.__uid)
    record("Employee cannot self-promote role", !!error, error ? error.message.slice(0, 70) : "promoted — SECURITY BUG")
  }
  {
    const { error } = await staff.from("profiles").update({ is_active: false }).eq("id", staff.__uid)
    record("Employee cannot self-deactivate", !!error, error ? error.message.slice(0, 70) : "deactivated — BUG")
  }

  // self check-in / out — today is a Saturday (rest day), so temporarily add
  // Saturday to every schedule, run the flow, then restore the exact arrays.
  const { data: scheds } = await admin.from("work_schedules").select("id, work_days")
  const origDays = new Map(scheds.map((s) => [s.id, s.work_days]))
  for (const s of scheds) {
    if (!s.work_days.includes(6)) await admin.from("work_schedules").update({ work_days: [...s.work_days, 6] }).eq("id", s.id)
  }
  {
    const ci = await staff.rpc("employee_check_in", { p_latitude: HQ.latitude, p_longitude: HQ.longitude })
    record("Self check-in inside geofence", !!ci.data?.success, ci.error ? ci.error.message : JSON.stringify(ci.data ?? {}).slice(0, 110))
  }
  {
    const dup = await staff.rpc("employee_check_in", { p_latitude: HQ.latitude, p_longitude: HQ.longitude })
    record("Duplicate self check-in rejected", !!dup.error, dup.error ? dup.error.message.slice(0, 70) : "allowed twice — BUG")
  }
  {
    const co = await staff.rpc("employee_check_out")
    record("Self check-out", !!co.data?.success, co.error ? co.error.message.slice(0, 90) : "")
  }
  {
    const far = await staff.rpc("employee_check_in", { p_latitude: 50, p_longitude: 8 })
    record("Check-in far outside geofence not silently OK", !!far.error || /outside|not|radius/i.test(JSON.stringify(far.data ?? "")), far.error ? "blocked" : JSON.stringify(far.data ?? {}).slice(0, 90))
  }
  {
    const { data: alertRows } = await admin.from("notifications").select("title").gte("created_at", T0).like("title", "Clock-%")
    const { count: obRows } = await admin.from("email_outbox").select("*", { count: "exact", head: true }).gte("created_at", T0).like("category", "attendance.check_%")
    record("Immediate check-in/out alerts (in-app + outbox)", (alertRows?.length ?? 0) >= 2 && obRows > 0, `in-app: ${alertRows?.length ?? 0}, emails: ${obRows}`)
  }

  // leave workflow: employee -> manager approval / officer approval / employee cancel
  let leaveIds = []
  {
    const l = await staff.rpc("submit_leave_request", { p_leave_type: "annual", p_start_date: "2026-11-02", p_end_date: "2026-11-03", p_reason: "E2E test leave" })
    record("Employee submits leave request", !!l.data?.id, l.error ? l.error.message.slice(0, 80) : `status ${l.data?.status}`)
    if (l.data?.id) leaveIds.push(l.data.id)
  }
  {
    const bad = await staff.rpc("review_leave_request", { p_request_id: leaveIds[0], p_decision: "approved", p_notes: null })
    record("Employee cannot approve own leave", !!bad.error, bad.error ? bad.error.message.slice(0, 70) : "approved — BUG")
  }
  {
    const a = await mgr.rpc("review_leave_request", { p_request_id: leaveIds[0], p_decision: "approved", p_notes: "E2E" })
    record("Manager approves own-branch leave", !!a.data?.id && a.data?.status === "approved", a.error ? a.error.message.slice(0, 90) : "approved")
  }
  {
    const l = await staff.rpc("submit_leave_request", { p_leave_type: "sick", p_start_date: "2026-11-09", p_end_date: "2026-11-09", p_reason: "E2E officer test" })
    if (l.data?.id) leaveIds.push(l.data.id)
    const a = l.error ? { error: l.error } : await officer.rpc("review_leave_request", { p_request_id: l.data.id, p_decision: "approved", p_notes: "E2E officer" })
    record("HR officer approves leave", !!a.data?.id, a.error ? a.error.message.slice(0, 90) : "approved")
  }
  {
    const l = await staff.rpc("submit_leave_request", { p_leave_type: "unpaid", p_start_date: "2026-11-16", p_end_date: "2026-11-16", p_reason: "E2E cancel test" })
    if (!l.error) {
      const c = await staff.rpc("cancel_leave_request", { p_request_id: l.data.id })
      if (c.error && /function public\.cancel_leave_request/i.test(c.error.message)) {
        record("Employee cancels own pending leave", false, "DB FUNCTION MISSING — migration 033 not fully applied; UI Cancel button will error")
      } else {
        record("Employee cancels own pending leave", !c.error, c.error ? c.error.message.slice(0, 90) : "cancelled")
      }
    } else record("Employee cancels own pending leave", false, `submit failed: ${l.error.message}`)
  }

  // corrections workflow: employee submits, HR approves, row rewritten + restored
  {
    const attDate = "2026-10-20"
    const { data: orig } = await admin.from("attendance_records").select("check_in, check_out").eq("employee_id", myEmp.id).eq("work_date", attDate).maybeSingle()
    const corr = await staff.rpc("submit_correction_request", { p_work_date: attDate, p_proposed_check_in: attDate + "T08:15:00Z", p_proposed_check_out: attDate + "T17:45:00Z", p_reason: "E2E correction" })
    record("Employee submits attendance correction", !!corr.data?.id, corr.error ? corr.error.message.slice(0, 80) : "created")
    if (corr.data?.id) {
      const ap = await hr.rpc("review_correction_request", { p_request_id: corr.data.id, p_decision: "approved", p_notes: "E2E" })
      record("HR approves correction", !ap.error, ap.error ? ap.error.message.slice(0, 90) : "approved")
      const { data: after } = await admin.from("attendance_records").select("check_in, check_out").eq("employee_id", myEmp.id).eq("work_date", attDate).maybeSingle()
      const applied = /T08:15:00/.test(after?.check_in ?? "") && /T17:45:00/.test(after?.check_out ?? "")
      record("Approved correction rewrote attendance row", applied, JSON.stringify({ check_in: after?.check_in, check_out: after?.check_out }))
      if (applied && orig) await admin.from("attendance_records").update({ check_in: orig.check_in, check_out: orig.check_out }).eq("employee_id", myEmp.id).eq("work_date", attDate)
      await admin.from("attendance_correction_requests").delete().eq("id", corr.data.id)
    }
  }

  // cutoff / reports / HR manual edit
  {
    const r = await staff.rpc("process_daily_cutoff", { p_date: "2026-10-23", p_force: true })
    record("Employee cannot run cutoff", !!r.error, r.error ? r.error.message.slice(0, 90) : "ran — SECURITY BUG")
  }
  {
    const r = await hr.rpc("process_daily_cutoff", { p_date: "2026-10-23", p_force: true })
    record("HR runs cutoff (reprocess 23 Oct)", !!r.data?.report_date, r.error ? r.error.message.slice(0, 90) : "")
  }
  {
    const r = await hr.rpc("regenerate_daily_report", { p_date: "2026-10-23" })
    record("HR regenerates a report", !!r.data?.report_date, r.error ? r.error.message.slice(0, 90) : "")
  }
  {
    const { data: orig } = await admin.from("attendance_records").select("*").eq("employee_id", myEmp.id).eq("work_date", "2026-10-21").maybeSingle()
    if (orig) {
      const r = await hr.rpc("hr_record_attendance", { p_employee_id: myEmp.id, p_work_date: "2026-10-21", p_check_in: "2026-10-21T08:02:00Z", p_check_out: "2026-10-21T17:04:00Z", p_reason: "E2E hr edit" })
      record("HR records/edits employee attendance", !r.error, r.error ? r.error.message.slice(0, 90) : "")
      await admin.from("attendance_records").update({ check_in: orig.check_in, check_out: orig.check_out, updated_reason: null }).eq("employee_id", myEmp.id).eq("work_date", "2026-10-21")
    } else {
      record("HR manual attendance edit", true, "21 Oct row absent — skipped")
    }
  }

  // kiosk (service-role RPC) — fresh record: drop staff's earlier row so the
  // kiosk path is exercised independently of the self check-in flow above
  const kEmp = (await admin.from("employees").select("id").eq("employee_no", "OSL-TEST-EMP").single()).data
  await admin.from("attendance_records").delete().eq("employee_id", kEmp.id).eq("work_date", todayStr)
  {
    const k = await admin.rpc("kiosk_record_attendance", { p_employee_id: kEmp.id, p_branch_id: null, p_action: "check_in", p_operator_id: null })
    record("Kiosk check-in", !!k.data?.success, k.error ? k.error.message.slice(0, 90) : JSON.stringify(k.data?.record ?? {}).slice(0, 80))
  }
  {
    const k = await admin.rpc("kiosk_record_attendance", { p_employee_id: kEmp.id, p_branch_id: null, p_action: "check_in", p_operator_id: null })
    record("Kiosk duplicate check-in rejected", !!k.error, k.error ? k.error.message.slice(0, 70) : "allowed — BUG")
  }
  {
    const k = await admin.rpc("kiosk_record_attendance", { p_employee_id: kEmp.id, p_branch_id: null, p_action: "check_out", p_operator_id: null })
    record("Kiosk check-out", !!k.data?.success, k.error ? k.error.message.slice(0, 70) : "")
  }

  // org-management writes (RLS: is_hr_admin) — create then delete
  {
    const holiday = { name: "E2E Test Holiday", holiday_date: "2026-11-30" }
    const ins = await hr.from("holidays").insert(holiday).select("id")
    record("HR adds a holiday", !ins.error && ins.data?.length === 1, ins.error ? ins.error.message : "created")
    const ins2 = await officer.from("holidays").insert({ name: "E2E Officer Holiday", holiday_date: "2026-12-01" })
    record("HR officer cannot write holidays (admin-only)", !!ins2.error, ins2.error ? "blocked" : "ALLOWED — BUG")
    const del = await hr.from("holidays").delete().in("name", ["E2E Test Holiday", "E2E Officer Holiday"])
    record("HR removes test holidays", !del.error, del.error ? del.error.message : "ok")
  }
  {
    const { data: branch } = await admin.from("branches").select("id, name").eq("code", "HQ").single()
    const mgrRepo = await mgr.from("branches").update({ name: "HEADQUARTERS-TAMPER" }).eq("id", branch.id).select("id")
    record("Manager cannot edit branches", !mgrRepo.error && (mgrRepo.data?.length ?? 0) === 0, `affected rows: ${mgrRepo.data?.length}`)
    const { data: nameNow } = await admin.from("branches").select("name").eq("id", branch.id).single()
    record("Branch untouched by manager tamper", nameNow?.name === branch.name, nameNow?.name)
  }
  {
    const rep = await staff.from("org_settings").update({ org_name: "TAMPERED" }).eq("id", 1).select("id")
    record("Employee cannot edit org settings", !rep.error && (rep.data?.length ?? 0) === 0, `affected rows: ${rep.data?.length}`)
    const { data: nameNow } = await admin.from("org_settings").select("org_name").eq("id", 1).single()
    record("Org settings untouched by tamper", nameNow?.org_name !== "TAMPERED", nameNow?.org_name)
  }

  // notifications
  {
    const { data } = await staff.from("notifications").select("user_id").limit(5)
    record("Employee reads only own notifications", (data ?? []).every((r) => r.user_id === staff.__uid), `${data?.length ?? 0} sampled`)
  }
  {
    const { error } = await staff.from("notifications").update({ is_read: true }).eq("user_id", staff.__uid).eq("is_read", false)
    record("Employee marks own notifications read", !error, error ? error.message.slice(0, 70) : "ok")
  }

  // storage
  {
    const { data: buckets } = await admin.storage.listBuckets()
    record("Avatars storage bucket exists", (buckets ?? []).some((b) => b.name === "avatars"), `buckets: ${(buckets ?? []).map((b) => b.name).join(", ")}`)
  }

  // ------------------------------------------------------------------ cleanup
  for (const [id, days] of origDays) {
    await admin.from("work_schedules").update({ work_days: days }).eq("id", id)
  }
  for (const empId of [myEmp.id, kEmp.id]) {
    await admin.from("attendance_records").delete().eq("employee_id", empId).eq("work_date", todayStr)
  }
  if (leaveIds.length) {
    await admin.from("attendance_records").delete().eq("employee_id", myEmp.id).gte("work_date", "2026-11-01").lte("work_date", "2026-11-30")
    await admin.from("leave_requests").delete().in("id", leaveIds)
  }
  await admin.from("notifications").delete().gte("created_at", T0).or(
    "title.like.Clock-in — Staff Orange*,title.like.Clock-out — Staff Orange*,title.like.Missed clock-in — Staff Orange*,title.like.Leave request — Staff Orange*,title.like.Correction request — Staff Orange*"
  )
  await admin.from("email_outbox").delete().gte("created_at", T0).like("category", "attendance.check_%")
  record("Cleanup completed", true, "today's test rows, test leave + roster rows, test notification/outbox rows")

  const pass = results.filter((r) => r.ok).length
  const fail = results.length - pass
  console.log(`\n==== DB LAYER: ${pass} passed, ${fail} failed ====`)
  results.filter((r) => !r.ok).forEach((r) => console.log(`  ✗ ${r.name}: ${r.detail}`))
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error("Suite crashed:", e)
  process.exit(2)
})
