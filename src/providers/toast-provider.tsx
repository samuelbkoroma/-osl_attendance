"use client"

import * as React from "react"
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 5000

type ToasterToast = {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: "default" | "destructive" | "success" | "warning"
  open?: boolean
  action?: React.ReactNode
}

let count = 0
function genId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ToastContextValue = {
  toast: (props: Omit<ToasterToast, "id" | "open">) => { id: string; dismiss: () => void; update: (props: Partial<ToasterToast>) => void }
  dismiss: (toastId?: string) => void
  error: (title: string, description?: React.ReactNode) => void
  success: (title: string, description?: React.ReactNode) => void
  warning: (title: string, description?: React.ReactNode) => void
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined)

export function ToastProviderRoot({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToasterToast[]>([])

  const dismiss = React.useCallback((toastId?: string) => {
    setToasts((prev) =>
      toastId ? prev.filter((t) => t.id !== toastId) : prev.filter((t) => t.open !== false)
    )
  }, [])

  const toast = React.useCallback<ToastContextValue["toast"]>((props) => {
    const id = genId()
    setToasts((prev) => [...prev.slice(-(TOAST_LIMIT - 1)), { ...props, id, open: true }])
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, TOAST_REMOVE_DELAY)
    return {
      id,
      dismiss: () => { clearTimeout(timer); dismiss(id) },
      update: (newProps) => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...newProps } : t)))
      },
    }
  }, [dismiss])

  const wrappedToast = React.useMemo(
    () => ({
      toast,
      dismiss,
      error: (title: string, description?: React.ReactNode) =>
        toast({ title, description, variant: "destructive" }),
      success: (title: string, description?: React.ReactNode) =>
        toast({ title, description, variant: "success" }),
      warning: (title: string, description?: React.ReactNode) =>
        toast({ title, description, variant: "warning" }),
    }),
    [toast, dismiss]
  )

  return (
    <ToastContext.Provider value={wrappedToast}>
      {children}
      <ToastProvider>
        {toasts.map((t) => {
          const barColor =
            t.variant === "destructive" ? "bg-destructive" :
            t.variant === "success" ? "bg-success" :
            t.variant === "warning" ? "bg-warning" : "bg-primary"
          return (
            <Toast
              key={t.id}
              variant={t.variant}
              open={t.open}
              onOpenChange={(open) => { if (!open) dismiss(t.id) }}
              className={cn("relative overflow-hidden")}
            >
              <div className={cn("absolute left-0 top-0 h-full w-1", barColor)} />
              <div className="flex-1">
                {t.title && <ToastTitle>{t.title}</ToastTitle>}
                {t.description && <ToastDescription>{t.description}</ToastDescription>}
              </div>
              {t.action}
              <ToastClose className="absolute right-2 top-2 rounded-md p-1 text-foreground/50 hover:text-foreground" />
            </Toast>
          )
        })}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}