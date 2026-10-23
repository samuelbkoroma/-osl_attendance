"use client"

import React, { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { MobileNav } from "./mobile-nav"
import { cn } from "@/lib/utils"

interface DashboardLayoutProps {
  children: React.ReactNode
  title?: string
}

export function DashboardLayout({ children, title }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpenPath, setMobileOpenPath] = useState<string | null>(null)
  const pathname = usePathname()
  const mobileOpen = mobileOpenPath === pathname
  const setMobileOpen = (open: boolean) => setMobileOpenPath(open ? pathname : null)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
  }, [pathname])

  return (
    <div className="min-h-[100dvh] bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className={cn("transition-[margin] duration-300", collapsed ? "lg:ml-[72px]" : "lg:ml-[268px]")}>
        <Header onMenuClick={() => setMobileOpen(true)} title={title} />
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-5 sm:px-5 lg:px-8 lg:pb-10 lg:pt-7"
        >
          <div key={pathname} className="page-enter">
            {children}
          </div>
          <footer className="mt-10 hidden items-center justify-between border-t border-border/60 pt-4 text-[11px] text-muted-foreground lg:flex">
            <span>Orange Sierra Leone · Workforce Attendance</span>
            <span>Times shown in Africa/Freetown (GMT)</span>
          </footer>
        </main>
      </div>

      <MobileNav onMore={() => setMobileOpen(true)} />
    </div>
  )
}
