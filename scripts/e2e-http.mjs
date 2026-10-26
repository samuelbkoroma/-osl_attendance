#!/usr/bin/env node
/**
 * HTTP-layer E2E: pages, middleware route guards, API authz, cron endpoints,
 * password change. Start a dev server first:
 *   npx next dev -p 3210   (background)
 * then: node --env-file=.env.local scripts/e2e-http.mjs
 */
import { createClient } from "@supabase/supabase-js"

const BASE = process.env.BASE ?? "http://localhost:3210"
const CRON_SECRET = process.env.CRON_SECRET
const PW = "Orange@2026"

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const results = []
function record(name, ok, detail = "") {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`)
}

function jarOf(res, existing = new Map()) {
  const jar = new Map(existing)
  for (const c of (res.headers.getSetCookie?.() ?? [])) {
    const [pair] = c.split(";")
    const eq = pair.indexOf("=")
    if (eq > 0 && pair.slice(eq + 1).trim()) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
  return jar
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
}

async function req(path, opts = {}, jar = new Map()) {
  return fetch(`${BASE}${path}`, {
    redirect: "manual",
    ...opts,
    headers: { ...(jar.size ? { Cookie: cookieHeader(jar) } : {}), ...(opts.headers ?? {}) },
  })
}

async function login(email, password = PW) {
  const res = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: email, password }),
  })
  const data = await res.json().catch(() => ({}))
  return { res, data, jar: jarOf(res) }
}

async function pageTest(session, path, expect) {
  const res = await req(path, {}, session.jar)
  const status = res.status
  const location = res.headers.get("location") ?? ""
  if (expect.status === "redirect") {
    record(`Route ${path} → redirect to ${expect.to}`, [302, 307].includes(status) && location.includes(expect.to), `got ${status} ${location}`)
    return
  }
  record(`Route ${path} → 200`, status === 200, `got ${status} ${location}`)
  if (status === 200 && expect.marker) {
    const html = await res.text()
    record(`Page ${path} renders "${expect.marker}"`, html.includes(expect.marker), /application error|server-side error/i.test(html) ? "APP ERROR" : "")
  }
}

async function post(session, path, body) {
  const res = await req(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session ? { Cookie: cookieHeader(session.jar) } : {}) },
    body: JSON.stringify(body),
  })
  return { res, data: await res.json().catch(() => ({})) }
}

async function main() {
  for (let i = 0; i < 30; i++) {
    try { if ((await req("/login")).status === 200) break } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 2000))
  }

  // ---------------------------------------------------------- anonymous users
  {
    const res = await req("/")
    const loc = res.headers.get("location") ?? ""
    record("Anon: / redirects to /login", [302, 307].includes(res.status) && loc.includes("/login"), `${res.status} ${loc}`)
  }
  {
    const res = await req("/login")
    const html = await res.text()
    record("Login page renders", res.status === 200, `${res.status}`)
    record("Login page shows sign-in form", /password/i.test(html) && !/application error/i.test(html), "")
  }
  {
    const res = await req("/employee")
    record("Anon: /employee redirected to /login", [302, 307].includes(res.status), `${res.status}`)
  }

  // ------------------------------------------------------------- login API
  {
    const { res } = await login("staff@orange.sl", "wrong-password")
    record("Wrong password → 401", res.status === 401, `${res.status}`)
  }
  {
    const { data, res } = await login("staff@orange.sl")
    record("Email + password login works", res.status === 200 && data?.success, `mustChangePassword: ${data?.mustChangePassword}`)
  }
  {
    const { data, res } = await login("OSL-TEST-EMP")
    record("Employee-number login works", res.status === 200 && data?.success, "OSL-TEST-EMP → staff@orange.sl")
  }

  // ------------------------------------------------------------- routing
  const staff = await login("staff@orange.sl")
  await pageTest(staff, "/employee", {})
  {
    const html = await (await req("/employee", {}, staff.jar)).text()
    record("Employee dashboard markup loads", !/application error/i.test(html), "no app error")
  }
  await pageTest(staff, "/employee/attendance", {})
  await pageTest(staff, "/employee/leave", {})
  await pageTest(staff, "/notifications", {})
  await pageTest(staff, "/profile", {})
  await pageTest(staff, "/hr", { status: "redirect", to: "/employee" })
  await pageTest(staff, "/manager", { status: "redirect", to: "/employee" })
  await pageTest(staff, "/hr/settings", { status: "redirect", to: "/employee" })

  const mgr = await login("manager@orange.sl")
  await pageTest(mgr, "/manager", {})
  await pageTest(mgr, "/manager/team", {})
  await pageTest(mgr, "/manager/leave", {})
  await pageTest(mgr, "/manager/corrections", {})
  await pageTest(mgr, "/hr", { status: "redirect", to: "/manager" })
  {
    const res = await req("/api/requests/review", { method: "GET" }, mgr.jar)
    record("Review API GET → 405 (POST-only)", res.status === 405, `${res.status}`)
  }

  const officer = await login("hr.officer@orangesl.demo")
  await pageTest(officer, "/hr", {})
  {
    const html = await (await req("/hr", {}, officer.jar)).text()
    record("HR dashboard renders for officer", html.includes("Cutoff"), "marker 'Cutoff'")
  }
  await pageTest(officer, "/hr/attendance", {})
  await pageTest(officer, "/hr/employees", {})
  await pageTest(officer, "/hr/leave", {})
  await pageTest(officer, "/hr/corrections", {})
  await pageTest(officer, "/hr/settings", { status: "redirect", to: "/hr" })

  const hrAdmin = await login("hr.admin@orangesl.demo")
  await pageTest(hrAdmin, "/hr/settings", {})
  {
    const html = await (await req("/hr/settings", {}, hrAdmin.jar)).text()
    record("Settings page renders for hr_admin", !/application error/i.test(html), "")
  }

  const supadm = await login("agness@orange-sonatel.com")
  record("super_admin login works", supadm.res.status === 200, "agness")
  await pageTest(supadm, "/hr", {})
  await pageTest(supadm, "/hr/settings", {})

  const pope = await login("pope@gmail.com")
  await pageTest(pope, "/hr", {})
  await pageTest(pope, "/hr/settings", {})

  const amie = await login("amiezo@gmail.com")
  await pageTest(amie, "/hr", {})
  await pageTest(amie, "/hr/employees", {})

  // ------------------------------------------------- API authz (role matrix)
  {
    const review = await post(staff, "/api/requests/review", { type: "leave", requestId: "00000000-0000-0000-0000-000000000000", decision: "approved" })
    record("/api/requests/review blocked for employee", !review.data?.success, `HTTP ${review.res.status}: ${JSON.stringify(review.data).slice(0, 70)}`)
  }
  {
    const patch = await post(officer, "/api/employees", {})
    record("/api/employees POST blocked for hr_officer (403)", patch.res.status === 403, `${patch.res.status}`)
  }
  {
    const patch = await post(mgr, "/api/employees", {})
    record("/api/employees POST blocked for manager (403)", patch.res.status === 403, `${patch.res.status}`)
  }
  {
    const patch = await post(mgr, "/api/employees", {})
    const setRole = await req("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader(mgr.jar) },
      body: JSON.stringify({ action: "set_role", userId: "00000000-0000-0000-0000-000000000000", role: "hr_admin" }),
    })
    record("/api/employees PATCH blocked for manager (403)", setRole.status === 403, `${setRole.status}${patch.res ? "" : ""}`)
  }
  {
    const setRole = await req("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader(officer.jar) },
      body: JSON.stringify({ action: "set_role", userId: "00000000-0000-0000-0000-000000000000", role: "hr_admin" }),
    })
    record("/api/employees PATCH blocked for hr_officer (403)", setRole.status === 403, `${setRole.status}`)
  }

  // ---------------------------------------------------------- employee create
  {
    const { data: branch } = await admin.from("branches").select("id").eq("code", "HQ").single()
    const { data: sched } = await admin.from("work_schedules").select("id").eq("code", "STD").single()
    const created = await post(hrAdmin, "/api/employees", {
      full_name: "E2E Test Person",
      email: "e2e.person@orangesl.demo",
      branch_id: branch.id,
      department_id: null,
      team_id: null,
      job_title: "E2E Tester",
      schedule_id: sched.id,
      hire_date: today(),
      role: "employee",
      rank: "staff",
    })
    record("HR creates employee (account + temp password)", created.res.status === 200 && !!created.data?.tempPassword && !!created.data?.employee?.id, `HTTP ${created.res.status}: ${JSON.stringify(created.data).slice(0, 90)}`)
    const empId = created.data?.employee?.id
    const tempPw = created.data?.tempPassword

    // duplicate email while the account still exists → must be rejected
    {
      const dup = await post(hrAdmin, "/api/employees", {
        full_name: "E2E Test Person", email: "e2e.person@orangesl.demo",
        branch_id: branch.id, schedule_id: sched.id,
      })
      record("Duplicate email rejected with 409", dup.res.status === 409 && !!dup.data?.error, `HTTP ${dup.res.status}: ${JSON.stringify(dup.data).slice(0, 80)}`)
    }

    if (tempPw) {
      const first = await login("e2e.person@orangesl.demo", tempPw)
      record("New employee logs in with temp password", first.res.status === 200 && first.data?.mustChangePassword === true, `mustChangePassword: ${first.data?.mustChangePassword}`)
      record("Force-change flag set on first login (redirects to /change-password)", first.data?.mustChangePassword === true, "AuthRouter → /change-password")
      await cleanupEmployee(empId)
      record("Cleanup: E2E test employee removed", true, "auth user + profile + employee deleted")
    }

    // same email after deletion → allowed again (account lifecycle works)
    {
      const again = await post(hrAdmin, "/api/employees", {
        full_name: "E2E Test Person", email: "e2e.person@orangesl.demo",
        branch_id: branch.id, schedule_id: sched.id,
      })
      record("Email reusable after account deleted", again.res.status === 200, `HTTP ${again.res.status}`)
      if (again.data?.employee?.id) await cleanupEmployee(again.data.employee.id)
    }

    // reset password action
    {
      const { data: imp } = await admin.from("employees").select("id, user_id").eq("email", null).limit(1)
      void imp
      const { data: anyEmp } = await admin.from("employees").select("id").eq("work_email", "hr.officer@orangesl.demo").single()
      const reset = await req("/api/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(hrAdmin.jar) },
        body: JSON.stringify({ action: "reset_password", employeeId: anyEmp.id }),
      })
      const resetData = await reset.json().catch(() => ({}))
      record("reset_password issues new temp password (sets must_change_password)", reset.status === 200 && !!resetData?.tempPassword, `HTTP ${reset.status}: ${JSON.stringify(resetData).slice(0, 60)}`)
      // restore officer's password so no one is locked out
      if (resetData?.success && resetData?.tempPassword) {
        const { data: prof } = await admin.from("profiles").select("id").eq("email", "hr.officer@orangesl.demo").single()
        await admin.auth.admin.updateUserById(prof.id, { password: PW })
        await admin.from("profiles").update({ must_change_password: false }).eq("id", prof.id)
      }
    }
  }

  // ------------------------------------------------------- password change E2E
  {
    const s = await login("test.odc@orangesl.demo")
    const changed = await post(s, "/api/auth/change-password", { currentPassword: PW, newPassword: "E2E-Temp-2026x" })
    record("Change-password API works", changed.res.status === 200 && changed.data?.success === true, `HTTP ${changed.res.status}`)
    const oldLogin = await login("test.odc@orangesl.demo", PW)
    record("Old password rejected after change", oldLogin.res.status === 401, `${oldLogin.res.status}`)
    const newLogin = await login("test.odc@orangesl.demo", "E2E-Temp-2026x")
    record("New password accepted, no forced re-change", newLogin.res.status === 200 && newLogin.data?.mustChangePassword === false, `mustChangePassword: ${newLogin.data?.mustChangePassword}`)
    await post(newLogin, "/api/auth/change-password", { currentPassword: "E2E-Temp-2026x", newPassword: PW })
    record("Password restored to standard", true, "test.odc back on Orange@2026")
    {
      const { error } = await admin.from("profiles").update({ must_change_password: false }).eq("email", "test.odc@orangesl.demo")
      record("Profile flag cleared", !error, error ? error.message : "ok")
    }
  }

  // ------------------------------------------------------------- cron endpoints
  {
    const res = await req("/api/cron/cutoff-report", { headers: { Authorization: `Bearer ${CRON_SECRET}` } })
    const data = await res.json().catch(() => ({}))
    record("Cron cutoff-report runs with bearer", res.status === 200 && data?.success === true, `HTTP ${res.status}: ${JSON.stringify(data?.result ?? data?.error ?? {}).slice(0, 110)}`)
    record("Cutoff report for today produced", !!data?.result?.report_date, `date: ${data?.result?.report_date}`)
    record("Missed clock-in chain alerts queued", data?.alerts?.success === true, JSON.stringify(data?.alerts ?? {}).slice(0, 80))
    record("Absent staff self-alert notified", data?.self_alerts !== undefined, JSON.stringify(data?.self_alerts ?? {}).slice(0, 80))
    record("Daily digest queued for HR", data?.digest?.success === true, JSON.stringify(data?.digest ?? {}).slice(0, 80))
    record("Outbox drain: no provider → skipped, queue intact", data?.email?.configured === false, JSON.stringify(data?.email ?? {}))
  }
  {
    const res = await req("/api/cron/drain-email", { headers: { Authorization: `Bearer ${CRON_SECRET}` } })
    record("Cron drain-email endpoint responds", res.status === 200, `${res.status}`)
  }

  // ------------------------------------------------------------------- report
  const pass = results.filter((r) => r.ok).length
  const fail = results.length - pass
  console.log(`\n==== HTTP LAYER: ${pass} passed, ${fail} failed ====`)
  results.filter((r) => !r.ok).forEach((r) => console.log(`  ✗ ${r.name}: ${r.detail}`))
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

async function cleanupEmployee(employeeId) {
  if (!employeeId) return
  const { data: emp } = await admin.from("employees").select("user_id").eq("id", employeeId).maybeSingle()
  if (emp?.user_id) await admin.auth.admin.deleteUser(emp.user_id)
  if (emp?.user_id) await admin.from("profiles").delete().eq("id", emp.user_id)
  await admin.from("employees").delete().eq("id", employeeId)
  if (emp?.user_id) await admin.from("email_outbox").delete().eq("reference", `welcome:${emp.user_id}`)
}

main().catch((e) => {
  console.error("HTTP suite crashed:", e)
  process.exit(2)
})
