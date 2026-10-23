import { describe, it, expect } from "vitest"
import { getDistanceFromODC, isWithinODC, getODCRadiusMeters } from "./geofence"
import { ODC_LOCATION, LOCATION_ACCURACY_BUFFER_METERS } from "./config"

describe("getDistanceFromODC", () => {
  it("returns 0 at the ODC location", () => {
    expect(getDistanceFromODC(ODC_LOCATION.latitude, ODC_LOCATION.longitude)).toBeCloseTo(0, 1)
  })

  it("returns roughly the expected distance for a nearby point", () => {
    const dist = getDistanceFromODC(ODC_LOCATION.latitude + 0.001, ODC_LOCATION.longitude)
    expect(dist).toBeGreaterThan(100)
    expect(dist).toBeLessThan(120)
  })

  it("returns a large distance for a far-away point", () => {
    const dist = getDistanceFromODC(40.7128, -74.006)
    expect(dist).toBeGreaterThan(6000000)
  })
})

describe("getODCRadiusMeters", () => {
  it("returns the base radius when no accuracy is given", () => {
    expect(getODCRadiusMeters()).toBe(ODC_LOCATION.radiusMeters)
  })

  it("adds the reported accuracy, capped at the configured buffer", () => {
    expect(getODCRadiusMeters(30)).toBe(ODC_LOCATION.radiusMeters + 30)
    expect(getODCRadiusMeters(500)).toBe(ODC_LOCATION.radiusMeters + LOCATION_ACCURACY_BUFFER_METERS)
  })

  it("ignores invalid accuracy values", () => {
    expect(getODCRadiusMeters(0)).toBe(ODC_LOCATION.radiusMeters)
    expect(getODCRadiusMeters(-10)).toBe(ODC_LOCATION.radiusMeters)
    expect(getODCRadiusMeters(Number.NaN)).toBe(ODC_LOCATION.radiusMeters)
  })
})

describe("isWithinODC", () => {
  it("is true at the ODC location", () => {
    expect(isWithinODC(ODC_LOCATION.latitude, ODC_LOCATION.longitude)).toBe(true)
  })

  it("is true just inside the radius", () => {
    const lat = ODC_LOCATION.latitude + 0.0005
    expect(isWithinODC(lat, ODC_LOCATION.longitude)).toBe(true)
  })

  it("is true when GPS accuracy slack covers the reported offset", () => {
    // ~280m away: outside the base radius but accepted with reported accuracy
    const lat = ODC_LOCATION.latitude + 0.0025
    expect(isWithinODC(lat, ODC_LOCATION.longitude)).toBe(false)
    expect(isWithinODC(lat, ODC_LOCATION.longitude, 100)).toBe(true)
  })

  it("is false far away", () => {
    expect(isWithinODC(40.7128, -74.006)).toBe(false)
  })

  it("is false beyond the radius even with accuracy slack", () => {
    const lat = ODC_LOCATION.latitude + 0.01
    expect(isWithinODC(lat, ODC_LOCATION.longitude, LOCATION_ACCURACY_BUFFER_METERS)).toBe(false)
  })
})