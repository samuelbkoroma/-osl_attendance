#!/usr/bin/env node
/**
 * Makes every account log in successfully with one shared password:
 *   1. Resets every auth user's password to the standard demo password.
 *   2. Confirms every email so sign-in never asks for confirmation.
 *   3. Clears must_change_password so users land straight on their dashboard.
 *   4. Syncs auth user_metadata.role to the profiles table role.
 *   5. Promotes director-ranked accounts to hr_admin (full company-wide access).
 *
 * Run: node --env-file=.env.local scripts/fix-accounts.mjs
 */
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const SHARED_PASSWORD = "Orange@2026"
/** profile roles granted to anyone whose employees.rank is 'director' — but
 *  never applied over an existing more-privileged role (super_admin). */
const DIRECTOR_ROLE = "hr_admin"

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data: { users }, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listErr) throw listErr
  console.log(`Found ${users.length} auth users`)

  const { data: emps, error: empErr } = await db
    .from("employees")
    .select("user_id, work_email, rank")
  if (empErr) throw empErr
  const rankByUserId = new Map(emps.filter((e) => e.user_id).map((e) => [e.user_id, e.rank]))

  let fixed = 0
  for (const user of users) {
    const rank = rankByUserId.get(user.id)
    const metaRole = rank === "director" ? DIRECTOR_ROLE : (user.user_metadata?.role ?? "employee")

    // 1–2. password + email confirmation (also clears any lingering reset state)
    const { error: updErr } = await db.auth.admin.updateUserById(user.id, {
      password: SHARED_PASSWORD,
      email_confirm: true,
      user_metadata: { ...user.user_metadata, role: metaRole },
    })
    if (updErr) {
      console.error(`  ! ${user.email}: ${updErr.message}`)
      continue
    }

    // 3. profile: must_change_password off (+ role sync for directors)
    const { data: profile } = await db
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle()
    if (profile) {
      const patch = { must_change_password: false }
      // only promote non-privileged roles; never downgrade super_admin
      if (rank === "director" && profile.role !== DIRECTOR_ROLE && profile.role !== "super_admin") {
        patch.role = DIRECTOR_ROLE
      }
      const { error: profErr } = await db.from("profiles").update(patch).eq("id", user.id)
      if (profErr) console.error(`  ! profile ${user.email}: ${profErr.message}`)
      // keep auth metadata role aligned with the profile role (only when changed)
      if (patch.role) {
        await db.auth.admin.updateUserById(user.id, {
          user_metadata: { ...user.user_metadata, role: patch.role },
        })
      }
    }
    fixed++
    console.log(`  OK ${user.email} (${profile ? profile.role : "no profile"})`)
  }

  console.log(`\nDone — ${fixed}/${users.length} accounts ready with password: ${SHARED_PASSWORD}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
