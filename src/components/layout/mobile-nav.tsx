"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/providers/auth-provider"
import { homeForRole } from "@/lib/navigation"
import { useUnreadNotificationCount } from "@/lib/queries"
import { getMobileNav, isNavItemActive } from "./nav-config"

export function MobileNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { data: unread = 0 } = useUnreadNotificationCount()

  if (!user || pathname === "/login") return null

  const items = getMobileNav(user.role)
  const home = homeForRole(user.role)

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/90 backdrop-blur-xl lg:hidden safe-bottom"
      aria-label="Quick navigation"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pb-1 pt-1.5">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item, home)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="group flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5"
            >
              <span
                className={cn(
                  "relative flex h-8 w-12 items-center justify-center rounded-xl transition-all",
                  active ? "bg-primary/12 text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.href === "/notifications" && unread > 0 && (
                  <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
                )}
              </span>
              <span
                className={cn(
                  "text-[10px] font-semibold leading-none",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={onMore}
          className="group flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5"
        >
          <span className="flex h-8 w-12 items-center justify-center rounded-xl text-muted-foreground transition-colors group-hover:text-foreground">
            <Menu className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[10px] font-semibold leading-none text-muted-foreground">More</span>
        </button>
      </div>
    </nav>
  )
}
