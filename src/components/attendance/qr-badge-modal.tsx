"use client"

import React, { useEffect, useState, useRef } from "react"
import QRCode from "qrcode"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { getInitials } from "@/lib/utils"
import { Download, Printer, ShieldCheck, Building2, Sparkles } from "lucide-react"

interface QRBadgeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: {
    id: string
    employee_no: string
    full_name: string
    job_title?: string | null
    branch?: { name: string; code: string } | null
    department?: { name: string } | null
    rank?: string | null
    profile?: { avatar_url?: string | null } | null
  }
}

export function QRBadgeModal({ open, onOpenChange, employee }: QRBadgeModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("")
  const badgeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !employee.id) return

    // Encode verified employee identity payload
    const payload = JSON.stringify({
      type: "ORANGE_BADGE",
      id: employee.id,
      no: employee.employee_no,
      ver: "1",
    })

    QRCode.toDataURL(payload, {
      width: 400,
      margin: 1.5,
      color: {
        dark: "#09090b",
        light: "#ffffff",
      },
      errorCorrectionLevel: "H",
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error("QR Code generation error:", err))
  }, [open, employee.id, employee.employee_no])

  const handleDownload = () => {
    if (!qrDataUrl) return
    const a = document.createElement("a")
    a.href = qrDataUrl
    a.download = `badge-qr-${employee.employee_no}.png`
    a.click()
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-border/80 bg-background">
        <div className="bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/20 backdrop-blur-sm">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase text-white/80">Orange SL</p>
                <h3 className="text-base font-bold text-white">Digital Staff Badge</h3>
              </div>
            </div>
            <Badge variant="outline" className="border-white/30 bg-white/10 text-white text-[11px]">
              Kiosk Pass
            </Badge>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Badge Preview Card */}
          <div
            ref={badgeRef}
            className="rounded-2xl border-2 border-border/80 bg-gradient-to-b from-card to-card/50 p-5 shadow-sm space-y-4"
          >
            <div className="flex items-center gap-3.5">
              <Avatar className="h-14 w-14 ring-2 ring-primary/20 shrink-0">
                <AvatarImage src={employee.profile?.avatar_url ?? undefined} alt={employee.full_name} />
                <AvatarFallback className="bg-primary/10 text-base font-bold text-primary">
                  {getInitials(employee.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-base leading-tight truncate">{employee.full_name}</h4>
                <p className="font-mono text-xs text-primary font-semibold mt-0.5">
                  ID: {employee.employee_no}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {employee.job_title ?? "Employee"}
                  {employee.department?.name ? ` · ${employee.department.name}` : ""}
                </p>
              </div>
            </div>

            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-4 shadow-inner border border-border/40">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt={`QR Badge for ${employee.full_name}`}
                  className="h-48 w-48 rounded-lg object-contain"
                />
              ) : (
                <div className="h-48 w-48 flex items-center justify-center text-muted-foreground animate-pulse text-xs">
                  Generating secure badge…
                </div>
              )}
              <p className="mt-2 text-center text-[11px] font-mono font-medium text-zinc-600">
                Scan at any branch kiosk terminal to clock in/out
              </p>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t pt-3">
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {employee.branch?.name ?? "Orange SL Branch"}
              </span>
              <span className="flex items-center gap-1 font-medium text-emerald-600">
                <ShieldCheck className="h-3 w-3" />
                Verified Active
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
              Download QR
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" />
              Print Pass
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
