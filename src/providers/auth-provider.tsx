"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"
import type { User } from "@/types"
import { createClient } from "@/lib/supabase/client"

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  refreshSession: () => Promise<User | null>
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const supabase = createClient()

async function fetchProfile(supabase: ReturnType<typeof createClient>, userId: string): Promise<User | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle()
  return profile as User | null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const initialCheckDone = useRef(false)

  /**
   * A deactivated account must not keep working from an already-issued
   * session. The API route also bans the auth user so token refresh stops,
   * but a token issued before the ban stays valid until it expires — this
   * ends the session on the next profile fetch.
   */
  const applyProfile = useCallback(async (userId: string) => {
    const profile = await fetchProfile(supabase, userId)
    if (profile && profile.is_active === false) {
      await supabase.auth.signOut()
      setUser(null)
      return null
    }
    setUser(profile)
    return profile
  }, [])

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await applyProfile(session.user.id)
      }
      if (!initialCheckDone.current) {
        initialCheckDone.current = true
        setIsLoading(false)
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          await applyProfile(session.user.id)
        } else {
          setUser(null)
        }
        if (!initialCheckDone.current) {
          initialCheckDone.current = true
          setIsLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [applyProfile])

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true }
  }, [])

  const logout = useCallback(async () => {
    setUser(null)
    await supabase.auth.signOut()
  }, [])

  const refreshSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      return await applyProfile(session.user.id)
    }
    setUser(null)
    return null
  }, [applyProfile])

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshSession, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}