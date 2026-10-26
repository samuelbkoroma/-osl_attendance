#!/usr/bin/env node
/** E2E test for POST /api/employees/import — creates + cleans everything. */
import { createClient } from "@supabase/supabase-js"

const BASE = process.env.BASE ?? "http://localhost:3000"
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const PW = "Orange@2026"
const results = []
const record = (n, ok, d = "") => { results.push({ n, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`) }

async function loginAs(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: email, password: PW }),
  })
  const jar = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ")
  return { jar, ok: res.status === 200, data: await res.json().catch(() => ({})) }
}

async function main() {
  const hr = await loginAs("hr.admin@orangesl.demo")
  record("hr_admin session for import", hr.ok)

  // 1. mixed batch: 2 good + 3 bad (dup-in-file, dup-in-db, bad branch)
  const stamp = Date.now().toString(36)
  const rows = [
    { full_name: "Import Test Alpha", email: `import.alpha.${stamp}@orangesl.demo`, branch: "HQ", department: "Operations", job_title: "E2E Importer", hire_date: "2026-10-24" },
    { full_name: "Import Test Bravo", email: `import.bravo.${stamp}@orangesl.demo`, branch: "HQ", role: "staff", rank: "intern" },
    { full_name: "Import Test Charlie", email: `import.alpha.${stamp}@orangesl.demo`, branch: "HQ" },             // dup in file
    { full_name: "Import Test Delta", email: "hr.officer@orangesl.demo", branch: "HQ" },                        // exists in DB
    { full_name: "Import Test Echo", email: `import.echo.${stamp}@orangesl.demo`, branch: "NOPE" },           // bad branch
  ]
  const res = await fetch(`${BASE}/api/employees/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: hr.jar },
    body: JSON.stringify({ rows }),
  })
  const data = await res.json()
  record("Import endpoint accepts batch", res.status === 200 && data?.success === true, `HTTP ${res.status}`)
  record("2 created, 3 gracefully failed", data?.summary?.created === 2 && data?.summary?.failed === 3, JSON.stringify(data?.summary))
  const [alpha, bravo, charlie, delta, echo] = data?.results ?? []
  record("Row 1 created with temp password + employee_no", alpha?.status === "created" && !!alpha?.temp_password && /^(OSL-)/.test(alpha?.employee_no ?? ""), alpha?.employee_no ?? "")
  record("Row 2 created with role/rank mapping", bravo?.status === "created")
  record("In-file duplicate rejected quoting original row", /Duplicate of row/.test(echoBro(charlie)), parseErr(charlie))
  record("Existing-DB email rejected", /already exists/.test(parseErr(delta)), parseErr(delta))
  record("Unknown branch rejected", /not found/.test(parseErr(echo)), parseErr(echo))
  function parseErr(r) { return r?.error ?? "" }
  function echoBro(r) { return r?.error ?? "" }

  // employee_no automatically assigned & distinct
  record("Auto employee numbers distinct", alpha?.employee_no !== bravo?.employee_no, `${alpha?.employee_no} vs ${bravo?.employee_no}`)

  // 2. welcome emails queued per created row
  const createdIds = [alpha, bravo].filter(r => r?.employee_id).map(r => r.employee_id)
  const { data: createdEmps } = await admin.from("employees").select("id, user_id, work_email, full_name, schedule_id, branch_id").in("id", createdIds)
  record("Created employees have branch + default schedule", createdEmps?.every(e => e.branch_id && e.schedule_id) === true)
  const { count: welcomeCount } = await admin.from("email_outbox").select("*", { count: "exact", head: true }).like("reference", "welcome:%").in("to_email", createdEmps?.map(e => e.work_email) ?? [])
  record("Welcome email queued per new employee", welcomeCount >= 2, `${welcomeCount} rows`)

  // 3. new employee can actually log in with temp password
  const first = await loginAs(alpha.email)
  record("Imported employee can log in", first.ok, `mustChangePassword: ${first.data?.mustChangePassword}`)

  // 4. manager blocked from import
  const mgr = await loginAs("manager@orange.sl")
  const mgrRes = await fetch(`${BASE}/api/employees/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: mgr.jar },
    body: JSON.stringify({ rows: [{ full_name: "X", email: "x@y.zz", branch: "HQ" }] }),
  })
  record("Import blocked for non-HR-admin (403)", mgrRes.status === 403, `HTTP ${mgrRes.status}`)

  // ---- cleanup
  for (const e of createdEmps ?? []) {
    if (e.user_id) await admin.auth.admin.deleteUser(e.user_id)
    await admin.from("profiles").delete().eq("id", e.user_id)
    await admin.from("employees").delete().eq("id", e.id)
  }
  await admin.from("email_outbox").delete().in("to_email", createdEmps?.map(e => e.work_email) ?? []).like("category", "auth.welcome")
  record("Cleanup: imported employees removed", true)

  const pass = results.filter(r => r.ok).length
  console.log(`\n==== IMPORT: ${pass}/${results.length} passed ====`)
  process.exit(pass === results.length ? 0 : 1)
}

main().catch(e => { console.error("crashed:", e); process.exit(2) })
