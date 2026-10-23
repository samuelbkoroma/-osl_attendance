import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/providers/auth-provider"
import { QueryProvider } from "@/providers/query-provider"
import { ToastProviderRoot } from "@/providers/toast-provider"
import { TooltipProvider } from "@/components/ui/tooltip"

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "Orange Sierra Leone — Workforce Attendance",
    template: "%s · Orange Workforce",
  },
  description: "Attendance management for Orange Sierra Leone employees across all branches",
  applicationName: "Orange Workforce Attendance",
  icons: { icon: "/logo.png" },
  appleWebApp: {
    capable: true,
    title: "Orange Workforce",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#f97316",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <QueryProvider>
          <AuthProvider>
            <ToastProviderRoot>
              <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
            </ToastProviderRoot>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
