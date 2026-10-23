"use client"

import * as React from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useToast } from "@/providers/toast-provider"
import { useUpdateProfile } from "@/lib/queries"
import { createClient } from "@/lib/supabase/client"
import { getInitials, cn, getRoleStyles } from "@/lib/utils"
import { UserRole } from "@/types"
import { Camera, Loader2, Trash2 } from "lucide-react"

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const PUBLIC_PREFIX = "/storage/v1/object/public/avatars/"

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase()
  if (fromName && ["jpg", "jpeg", "png", "webp"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName
  }
  if (file.type === "image/png") return "png"
  if (file.type === "image/webp") return "webp"
  return "jpg"
}

export function AvatarUploader({
  userId,
  fullName,
  avatarUrl,
  role,
}: {
  userId: string
  fullName: string
  avatarUrl: string | null
  role?: UserRole
}) {
  const supabase = React.useMemo(() => createClient(), [])
  const updateProfile = useUpdateProfile()
  const { success, error: toastError } = useToast()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)

  const roleStyles = getRoleStyles(role ?? "employee")

  const handleFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toastError("Unsupported photo", "Use a JPG, PNG or WebP image.")
      return
    }
    if (file.size > MAX_BYTES) {
      toastError("Photo is too large", "Choose an image smaller than 2 MB.")
      return
    }

    setBusy(true)
    const ext = extensionFor(file)
    const path = `${userId}/avatar-${Date.now()}.${ext}`
    try {
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false })
      if (uploadError) throw new Error(uploadError.message)

      const { data } = supabase.storage.from("avatars").getPublicUrl(path)
      try {
        await updateProfile.mutateAsync({ avatar_url: data.publicUrl })
      } catch (err) {
        await supabase.storage.from("avatars").remove([path])
        throw err
      }
      success("Photo updated", "Your profile photo was saved.")
    } catch (err) {
      toastError("Upload failed", err instanceof Error ? err.message : "Try again shortly.")
    } finally {
      setBusy(false)
    }
  }

  const removePhoto = async () => {
    setBusy(true)
    try {
      await updateProfile.mutateAsync({ avatar_url: null })
      if (avatarUrl?.includes(PUBLIC_PREFIX)) {
        const path = decodeURIComponent(avatarUrl.split(PUBLIC_PREFIX)[1]?.split("?")[0] ?? "")
        if (path) await supabase.storage.from("avatars").remove([path])
      }
      success("Photo removed", "Your initials are shown again.")
    } catch (err) {
      toastError("Could not remove photo", err instanceof Error ? err.message : "Try again shortly.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
      <div className="relative group">
        <Avatar className={cn("h-20 w-20 ring-4 ring-card sm:h-24 sm:w-24 transition-transform group-hover:scale-[1.02]", roleStyles.ring)}>
          <AvatarImage src={avatarUrl ?? undefined} alt={fullName} />
          <AvatarFallback className={cn("text-xl font-semibold sm:text-2xl", roleStyles.avatar)}>
            {getInitials(fullName)}
          </AvatarFallback>
        </Avatar>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
          title="Upload photo"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) void handleFile(file)
            }}
          />
          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void removePhoto()}
              className="h-8 px-2 text-[11px] text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Remove photo
            </Button>
          )}
        </div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
          Passport Photo (Max 2MB)
        </p>
      </div>
    </div>
  )
}
