import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateTempPassword } from "@/lib/password"

const USER_ROLES = ["super_admin", "hr_admin", "hr_officer", "branch_manager", "employee"] as const
const EMPLOYMENT_STATUSES = ["active", "inactive", "on_leave", "terminated"] as const
const EMPLOYEE_RANKS = [
  "ceo",
  "director",
  "senior_manager",
  "manager",
  "staff",
  "temporary_staff",
  "intern",
] as const

async function getCaller(): Promise<{ userId: string; role: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile || (profile as { is_active: boolean }).is_active === false) return null
  return { userId: user.id, role: (profile as { role: string }).role }
}

function isHrAdmin(role: string): boolean {
  return role === "super_admin" || role === "hr_admin"
}

export async function POST(request: Request) {
  try {
    const caller = await getCaller()
    if (!caller) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!isHrAdmin(caller.role)) {
      return NextResponse.json({ error: "Only HR administrators can add employees" }, { status: 403 })
    }

    const body = await request.json()
    const {
      full_name,
      email,
      phone,
      branch_id,
      department_id,
      team_id,
      job_title,
      schedule_id,
      hire_date,
      role = "employee",
      employment_status = "active",
      rank = "staff",
      manager_id = null,
    } = body ?? {}

    if (!full_name?.trim() || !email?.trim() || !branch_id || !schedule_id) {
      return NextResponse.json(
        { error: "Full name, email, branch and work schedule are required" },
        { status: 400 }
      )
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Enter a valid work email" }, { status: 400 })
    }
    if (!USER_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }
    if (!EMPLOYMENT_STATUSES.includes(employment_status)) {
      return NextResponse.json({ error: "Invalid employment status" }, { status: 400 })
    }
    if (!EMPLOYEE_RANKS.includes(rank)) {
      return NextResponse.json({ error: "Invalid rank" }, { status: 400 })
    }

    const admin = createAdminClient()
    const tempPassword = generateTempPassword(10)

    // One login per work email — reject duplicates before creating the auth
    // user (which reuse of the same email would otherwise silently duplicate).
    const normalisedEmail = email?.trim().toLowerCase()
    const { data: existingEmployee } = await admin
      .from("employees")
      .select("id")
      .eq("work_email", normalisedEmail)
      .maybeSingle()
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", normalisedEmail)
      .maybeSingle()
    if (existingEmployee || existingProfile) {
      return NextResponse.json(
        { error: "An account already exists with this email. Reset their password instead of creating a new account." },
        { status: 409 }
      )
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: full_name.trim(),
        role,
        must_change_password: true,
      },
    })

    if (createError || !created.user) {
      const message = createError?.message ?? "Failed to create the login account"
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { data: employee, error: insertError } = await admin
      .from("employees")
      .insert({
        user_id: created.user.id,
        full_name: full_name.trim(),
        work_email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        branch_id,
        department_id: department_id || null,
        team_id: team_id || null,
        job_title: job_title?.trim() || null,
        schedule_id,
        hire_date: hire_date || null,
        employment_status,
        rank,
        manager_id: manager_id || null,
        created_by: caller.userId,
      })
      .select("*")
      .single()

    if (insertError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return NextResponse.json({ error: insertError.message }, { status: 400 })
    }

    // Queue welcome email for the new employee
    try {
      await admin.from("email_outbox").insert({
        to_email: email.trim().toLowerCase(),
        subject: "Welcome to Orange Sierra Leone Attendance System",
        category: "auth.welcome",
        reference: `welcome:${created.user.id}`,
        body_html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ff7900;">Welcome, ${full_name.trim()}!</h2>
            <p>Your attendance account has been created. You can now log in to record your attendance and manage leave.</p>
            <div style="background: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Staff ID / Email:</strong> ${email.trim().toLowerCase()}</p>
              <p style="margin: 5px 0 0 0;"><strong>Temporary Password:</strong> <code style="background: #eee; padding: 2px 4px;">${tempPassword}</code></p>
            </div>
            <p>For security, you will be required to change this password upon your first login.</p>
            <p>Best regards,<br/>Orange SL HR Team</p>
          </div>
        `,
        body_text: `Welcome ${full_name.trim()}! Your attendance account is ready. Login with ${email.trim().toLowerCase()} and temporary password: ${tempPassword}. You must change this password on first login.`,
      })
    } catch (emailErr) {
      console.error("Failed to queue welcome email:", emailErr)
      // We don't fail the employee creation if the email queue fails, 
      // since the HR admin still gets the password in the response.
    }

    return NextResponse.json({ employee, tempPassword })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const caller = await getCaller()
    if (!caller) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!isHrAdmin(caller.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    const admin = createAdminClient()

    if (body.action === "reset_password") {
      const { employeeId } = body
      if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 })

      const { data: employee } = await admin
        .from("employees")
        .select("user_id, full_name")
        .eq("id", employeeId)
        .maybeSingle()

      const userId = (employee as { user_id: string | null } | null)?.user_id
      if (!userId || !employee) {
        return NextResponse.json({ error: "Employee has no linked login account" }, { status: 400 })
      }

      const tempPassword = generateTempPassword(10)
      const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })

      await admin.from("profiles").update({ must_change_password: true }).eq("id", userId)

      return NextResponse.json({ success: true, tempPassword })
    }

    if (body.action === "set_role") {
      const { userId, role } = body
      if (!userId || !USER_ROLES.includes(role)) {
        return NextResponse.json({ error: "userId and a valid role are required" }, { status: 400 })
      }
      if (userId === caller.userId) {
        return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 })
      }

      const { data: target } = await admin.auth.admin.getUserById(userId)
      if (!target?.user) return NextResponse.json({ error: "User not found" }, { status: 404 })

      const { error: metaError } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { ...(target.user.user_metadata ?? {}), role },
      })
      if (metaError) return NextResponse.json({ error: metaError.message }, { status: 400 })

      const { error: profileError } = await admin.from("profiles").update({ role }).eq("id", userId)
      if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 })

      return NextResponse.json({ success: true })
    }

    if (body.action === "set_profile_active") {
      const { userId, isActive } = body
      if (!userId || typeof isActive !== "boolean") {
        return NextResponse.json({ error: "userId and isActive are required" }, { status: 400 })
      }
      if (userId === caller.userId) {
        return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 })
      }

      const { error } = await admin.from("profiles").update({ is_active: isActive }).eq("id", userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })

      // profiles.is_active alone does not end an active session: the user
      // keeps their cookie until it expires. Banning the auth user blocks
      // token refresh, which signs them out for real.
      const { data: target } = await admin.auth.admin.getUserById(userId)
      if (target?.user) {
        const { error: banError } = await admin.auth.admin.updateUserById(userId, {
          ban_duration: isActive ? "none" : "876000h",
        })
        if (banError) {
          return NextResponse.json(
            { error: `Profile updated but the sign-in account could not be updated: ${banError.message}` },
            { status: 400 }
          )
        }
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}
