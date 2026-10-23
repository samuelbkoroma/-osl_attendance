import { ODC_LOCATION, LOCATION_ACCURACY_BUFFER_METERS } from "./config"

export interface ODCLocationCenter {
  name?: string
  address?: string
  latitude: number
  longitude: number
  radiusMeters: number
}

export function getDistanceFrom(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function getDistanceFromODC(lat: number, lng: number): number {
  return getDistanceFrom(lat, lng, ODC_LOCATION.latitude, ODC_LOCATION.longitude)
}

/**
 * Effective check-in radius. When the device's GPS reports an accuracy figure
 * we treat a coordinate as "inside" if it falls within the base radius plus up
 * to the accuracy slack. This tolerates GPS drift that commonly happens inside
 * buildings where satellite fixes are poor.
 */
export function getEffectiveRadiusMeters(accuracyMeters?: number, baseRadiusMeters = ODC_LOCATION.radiusMeters): number {
  const slack =
    typeof accuracyMeters === "number" &&
    Number.isFinite(accuracyMeters) &&
    accuracyMeters > 0
      ? Math.min(accuracyMeters, LOCATION_ACCURACY_BUFFER_METERS)
      : 0
  return baseRadiusMeters + slack
}

export function getODCRadiusMeters(accuracyMeters?: number): number {
  return getEffectiveRadiusMeters(accuracyMeters, ODC_LOCATION.radiusMeters)
}

/**
 * True when the given coordinate falls within `radiusMeters` of the given
 * center point (haversine).
 */
export function isWithinRadius(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): boolean {
  return getDistanceFrom(lat, lng, centerLat, centerLng) <= radiusMeters
}

export function isWithinODC(lat: number, lng: number, accuracyMeters?: number): boolean {
  return isWithinRadius(lat, lng, ODC_LOCATION.latitude, ODC_LOCATION.longitude, getODCRadiusMeters(accuracyMeters))
}

/** Distance (m) from a dynamic center (used when the center comes from Supabase). */
export function distanceToCenter(lat: number, lng: number, center: ODCLocationCenter): number {
  return getDistanceFrom(lat, lng, center.latitude, center.longitude)
}

/** Geofence check against a dynamic center (defaults to the static config). */
export function isWithinDynamicCenter(
  lat: number,
  lng: number,
  center: ODCLocationCenter,
  accuracyMeters?: number
): boolean {
  return isWithinRadius(
    lat,
    lng,
    center.latitude,
    center.longitude,
    getEffectiveRadiusMeters(accuracyMeters, center.radiusMeters)
  )
}

/**
 * Resolves the best available GPS fix. Browsers frequently return a low-accuracy
 * first fix indoors; this fires several concurrent requests and keeps the one
 * with the smallest reported error so check-ins are accepted when the student is
 * genuinely on the premises.
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"))
      return
    }

    const attempts = 3
    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    }

    let settled = 0
    let best: GeolocationPosition | null = null
    let lastError: GeolocationPositionError | null = null

    for (let i = 0; i < attempts; i++) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          settled++
          if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos
          if (settled >= attempts) {
            if (best) resolve(best)
            else reject(lastError ?? new Error("Geolocation failed"))
          }
        },
        (err) => {
          settled++
          lastError = err
          if (settled >= attempts) {
            if (best) resolve(best)
            else reject(lastError ?? new Error("Geolocation failed"))
          }
        },
        options
      )
    }
  })
}
/**
 * Best-effort fix for background context (e.g. attaching coordinates to an
 * attendance alert). Never rejects and uses a short timeout so it cannot block
 * a clock-in when location is not mandatory.
 */
export function getBestEffortPosition(timeoutMs = 5000): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 }
    )
  })
}
