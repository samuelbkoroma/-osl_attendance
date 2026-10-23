"use client"

import React, { useEffect, useState, useRef, useCallback, useSyncExternalStore } from "react"
import Link from "next/link"
import { Html5Qrcode } from "html5-qrcode"
import { useBranches } from "@/lib/queries"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { getInitials } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CheckCircle2,
  Clock,
  ArrowLeft,
  Building2,
  AlertCircle,
  LogIn,
  LogOut,
  Keyboard,
  ScanLine,
  RefreshCw,
  MapPin,
  ShieldCheck,
} from "lucide-react"

const KIOSK_BRANCH_KEY = "orange_kiosk_branch_id"
const KIOSK_BRANCH_EVENT = "orange-kiosk-branch-change"

/**
 * The chosen branch lives in localStorage so a shared terminal remembers it
 * between shifts. It is read through an external store instead of an effect so
 * the value is available on the first paint and never lags a render behind.
 */
function subscribeKioskBranch(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(KIOSK_BRANCH_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(KIOSK_BRANCH_EVENT, onChange)
  }
}

function readKioskBranch(): string {
  try {
    return window.localStorage.getItem(KIOSK_BRANCH_KEY) ?? ""
  } catch {
    return ""
  }
}

interface KioskResult {
  action: "check_in" | "check_out" | "already_checked_in"
  message?: string
  employee: {
    id: string
    employee_no: string
    full_name: string
    job_title?: string
    avatar_url?: string | null
    branch_name?: string
  }
  record?: {
    check_in?: string | null
    check_out?: string | null
    status?: string
    minutes_late?: number
  }
}

export default function KioskPage() {
  const branches = useBranches(true)
  const persistedBranchId = useSyncExternalStore(
    subscribeKioskBranch,
    readKioskBranch,
    () => ""
  )
  const [mode, setMode] = useState<"check_in" | "check_out">("check_in")
  const [activeTab, setActiveTab] = useState<"scan" | "manual">("scan")
  const [manualInput, setManualInput] = useState("")
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<KioskResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [timeStr, setTimeStr] = useState("")
  const [dateStr, setDateStr] = useState("")

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const isProcessingRef = useRef(false)
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Live Freetown clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTimeStr(
        now.toLocaleTimeString("en-GB", {
          timeZone: "Africa/Freetown",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      )
      setDateStr(
        now.toLocaleDateString("en-GB", {
          timeZone: "Africa/Freetown",
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      )
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  // The remembered branch wins, but only while it still exists; otherwise the
  // terminal falls back to the first active branch.
  const selectedBranchId =
    persistedBranchId && branches.data?.some((b) => b.id === persistedBranchId)
      ? persistedBranchId
      : branches.data?.[0]?.id ?? ""

  const handleBranchChange = (id: string) => {
    try {
      window.localStorage.setItem(KIOSK_BRANCH_KEY, id)
      window.dispatchEvent(new Event(KIOSK_BRANCH_EVENT))
    } catch {
      // Storage unavailable (private mode) — the selection still applies for
      // this session.
    }
  }

  // Play audio chime synthesized with Web Audio API
  const playChime = useCallback((type: "success" | "error") => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      if (type === "success") {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15) // A5
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.35)
      } else {
        osc.frequency.setValueAtTime(300, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.2)
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.3)
      }
    } catch {
      // Audio autoplay policy might prevent playback silently
    }
  }, [])

  // Send scan payload to API
  const submitAttendance = useCallback(
    async (payload: { raw_payload?: string; employee_no?: string }) => {
      if (isProcessingRef.current) return
      isProcessingRef.current = true
      setSubmitting(true)
      setErrorMessage(null)

      try {
        const res = await fetch("/api/kiosk/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            action: mode,
            branch_id: selectedBranchId,
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || "Attendance recording failed")
        }

        playChime("success")
        setResult(data)
        setManualInput("")

        // Auto dismiss confirmation after 4.5 seconds
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
        dismissTimerRef.current = setTimeout(() => {
          setResult(null)
          isProcessingRef.current = false
        }, 4500)
      } catch (err) {
        playChime("error")
        setErrorMessage(err instanceof Error ? err.message : "Failed to record attendance")
        isProcessingRef.current = false
      } finally {
        setSubmitting(false)
      }
    },
    [mode, selectedBranchId, playChime]
  )

  // Camera setup and cleanup
  useEffect(() => {
    if (activeTab !== "scan") {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
          scannerRef.current = null
          setCameraActive(false)
        })
      }
      return
    }

    const scannerId = "kiosk-reader"
    const html5Qr = new Html5Qrcode(scannerId)
    scannerRef.current = html5Qr

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
    }

    html5Qr
      .start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          if (!isProcessingRef.current) {
            submitAttendance({ raw_payload: decodedText })
          }
        },
        () => {
          // Ignored per-frame scan errors
        }
      )
      .then(() => {
        setCameraActive(true)
        setCameraError(null)
      })
      .catch((err) => {
        console.error("Camera access error:", err)
        setCameraActive(false)
        setCameraError(
          "Camera access unavailable. Ensure permissions are granted or switch to Manual Keypad."
        )
      })

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
          scannerRef.current = null
          setCameraActive(false)
        })
      }
    }
  }, [activeTab, submitAttendance])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualInput.trim()) return
    submitAttendance({ employee_no: manualInput.trim() })
  }

  const selectedBranch = branches.data?.find((b) => b.id === selectedBranchId)

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-between selection:bg-orange-500 selection:text-white">
      {/* Top Bar */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/hr"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors bg-zinc-800/60 hover:bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700/60"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Link>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 font-bold text-white shadow-lg shadow-orange-500/20">
              O
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight">Orange SL</span>
              <span className="text-[11px] text-zinc-400 block font-mono">Branch Kiosk Terminal</span>
            </div>
          </div>
        </div>

        {/* Live Clock & Date */}
        <div className="text-right">
          <div className="flex items-center gap-2 text-xl font-mono font-bold tracking-tight text-orange-400">
            <Clock className="h-4 w-4 text-orange-500 animate-pulse" />
            {timeStr || "00:00:00"}
          </div>
          <p className="text-[11px] text-zinc-400 font-medium">{dateStr || "Today"}</p>
        </div>

        {/* Branch Selector */}
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-zinc-400" />
          <Select value={selectedBranchId} onValueChange={handleBranchChange}>
            <SelectTrigger className="h-9 w-52 bg-zinc-900 border-zinc-700 text-xs text-white">
              <SelectValue placeholder="Select Branch" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
              {(branches.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-xs">
                  {b.name} ({b.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Main Kiosk Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full">
        {/* Mode Selector (Check-In vs Check-Out) */}
        <div className="w-full max-w-md mb-6 grid grid-cols-2 gap-3 p-1.5 bg-zinc-900/90 rounded-2xl border border-zinc-800">
          <button
            type="button"
            onClick={() => {
              setMode("check_in")
              setResult(null)
              setErrorMessage(null)
            }}
            className={`flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl text-sm font-semibold transition-all ${
              mode === "check_in"
                ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-900/40"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <LogIn className="h-4 w-4" />
            Clock In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("check_out")
              setResult(null)
              setErrorMessage(null)
            }}
            className={`flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl text-sm font-semibold transition-all ${
              mode === "check_out"
                ? "bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg shadow-orange-900/40"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <LogOut className="h-4 w-4" />
            Clock Out
          </button>
        </div>

        {/* Scanner Card */}
        <div className="w-full max-w-md bg-zinc-900/70 border border-zinc-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          {/* Confirmation Overlay when Attendance is recorded */}
          {result && (
            <div className="absolute inset-0 bg-zinc-950/95 z-20 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-200">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-2xl mb-4 ${
                  result.action === "check_out"
                    ? "bg-amber-500/20 text-amber-400"
                    : result.action === "already_checked_in"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-emerald-500/20 text-emerald-400"
                }`}
              >
                <CheckCircle2 className="h-9 w-9" />
              </div>

              <Avatar className="h-20 w-20 ring-4 ring-orange-500/30 mb-3">
                <AvatarImage src={result.employee.avatar_url ?? undefined} alt={result.employee.full_name} />
                <AvatarFallback className="bg-orange-500/20 text-xl font-bold text-orange-400">
                  {getInitials(result.employee.full_name)}
                </AvatarFallback>
              </Avatar>

              <h3 className="text-xl font-bold text-white leading-tight">{result.employee.full_name}</h3>
              <p className="font-mono text-xs text-orange-400 mt-0.5">ID: {result.employee.employee_no}</p>
              <p className="text-xs text-zinc-400 mt-1">{result.employee.job_title ?? "Employee"}</p>

              <div className="mt-4 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 w-full space-y-1">
                <div className="text-xs font-semibold text-zinc-200">
                  {result.action === "check_out"
                    ? "Clock-Out Successful"
                    : result.action === "already_checked_in"
                    ? "Already Checked In"
                    : "Clock-In Confirmed"}
                </div>
                {result.message ? (
                  <p className="text-[11px] text-zinc-400">{result.message}</p>
                ) : (
                  <div className="flex items-center justify-center gap-3 text-xs pt-1">
                    <span className="text-zinc-400">
                      Time:{" "}
                      <span className="font-mono font-bold text-white">
                        {result.record?.check_in
                          ? new Date(result.record.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "Recorded"}
                      </span>
                    </span>
                    {result.record?.status === "late" && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                        Late ({result.record.minutes_late} min)
                      </Badge>
                    )}
                    {result.record?.status === "present" && (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                        On Time
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="mt-5 text-xs text-zinc-400 hover:text-white border-zinc-800"
                onClick={() => {
                  setResult(null)
                  isProcessingRef.current = false
                }}
              >
                Next Employee
              </Button>
            </div>
          )}

          {/* Tab Switcher: QR Scan vs Keypad */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
            <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
              <ScanLine className="h-3.5 w-3.5 text-orange-500" />
              {activeTab === "scan" ? "Position badge in front of camera" : "Enter employee number"}
            </span>

            <div className="flex items-center gap-1 bg-zinc-800/80 p-0.5 rounded-lg border border-zinc-700/50">
              <button
                type="button"
                onClick={() => setActiveTab("scan")}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  activeTab === "scan" ? "bg-zinc-700 text-white font-medium" : "text-zinc-400 hover:text-white"
                }`}
              >
                Scanner
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("manual")}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  activeTab === "manual" ? "bg-zinc-700 text-white font-medium" : "text-zinc-400 hover:text-white"
                }`}
              >
                Keypad
              </button>
            </div>
          </div>

          {/* Camera Viewport */}
          {activeTab === "scan" && (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-square flex items-center justify-center border border-zinc-800">
                <div id="kiosk-reader" className="w-full h-full object-cover" />

                {!cameraActive && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400">
                    <RefreshCw className="h-8 w-8 animate-spin text-orange-500" />
                    <span className="text-xs">Initializing camera…</span>
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3 bg-zinc-950">
                    <AlertCircle className="h-10 w-10 text-rose-500" />
                    <p className="text-xs text-rose-300 leading-relaxed">{cameraError}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-zinc-700"
                      onClick={() => setActiveTab("manual")}
                    >
                      Use Keypad Instead
                    </Button>
                  </div>
                )}

                {/* Reticle Guide Lines */}
                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-56 h-56 border-2 border-orange-500/80 rounded-2xl relative shadow-[0_0_20px_rgba(249,115,22,0.3)]">
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-orange-400 rounded-tl" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-orange-400 rounded-tr" />
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-orange-400 rounded-bl" />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-orange-400 rounded-br" />
                    </div>
                  </div>
                )}
              </div>

              <p className="text-center text-[11.5px] text-zinc-400">
                Hold your <span className="text-orange-400 font-medium">Digital Pass QR code</span> steady in front of the lens.
              </p>
            </div>
          )}

          {/* Manual Entry Fallback */}
          {activeTab === "manual" && (
            <form onSubmit={handleManualSubmit} className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-300 block font-medium">Employee Number or Staff ID</label>
                <div className="relative">
                  <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="e.g. ODC-2026-001"
                    className="pl-9 h-11 bg-zinc-950 border-zinc-800 text-sm font-mono text-white placeholder:text-zinc-600 focus-visible:ring-orange-500"
                    autoFocus
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting || !manualInput.trim()}
                className="w-full h-11 bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-orange-600/25"
              >
                {submitting ? "Verifying…" : mode === "check_in" ? "Clock In Now" : "Clock Out Now"}
              </Button>
            </form>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      </main>

      {/* Footer Info */}
      <footer className="border-t border-zinc-900 bg-zinc-950/80 px-6 py-3 flex flex-wrap items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-zinc-400" />
          <span>Active Station: {selectedBranch?.name ?? "Freetown Branch"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-500 font-medium">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Encrypted Kiosk Mode</span>
        </div>
      </footer>
    </div>
  )
}
