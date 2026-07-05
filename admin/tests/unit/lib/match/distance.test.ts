import { describe, expect, it } from "vitest"
import { haversineKm } from "@/lib/match/distance"

describe("lib/match/distance - haversineKm", () => {
  it("returns 0 for the same point", () => {
    expect(haversineKm(39.9, 116.4, 39.9, 116.4)).toBe(0)
  })

  it("is symmetric: haversineKm(a,b) === haversineKm(b,a)", () => {
    const d1 = haversineKm(39.908, 116.397, 39.937, 116.479)
    const d2 = haversineKm(39.937, 116.479, 39.908, 116.397)
    expect(d1).toBeCloseTo(d2, 10)
  })

  it("computes Beijing Chaoyang Park → Tiananmen ≈ 7-9 km", () => {
    // 朝阳公园:~39.937, 116.479
    // 天安门:~39.908, 116.397
    const distance = haversineKm(39.937, 116.479, 39.908, 116.397)
    expect(distance).toBeGreaterThan(6)
    expect(distance).toBeLessThan(10)
  })

  it("computes a short distance (~1 km) correctly", () => {
    // 天安门到故宫博物院约 0.7km
    const distance = haversineKm(39.908, 116.397, 39.916, 116.397)
    expect(distance).toBeGreaterThan(0.5)
    expect(distance).toBeLessThan(1.5)
  })

  it("returns large distance for antipodal points (~20015 km)", () => {
    // 对跖点距离约为地球周长的一半
    const distance = haversineKm(0, 0, 0, 180)
    expect(distance).toBeGreaterThan(19900)
    expect(distance).toBeLessThan(20100)
  })

  it("handles negative coordinates (southern/western hemisphere)", () => {
    const d1 = haversineKm(-33.8688, 151.2093, -33.8688, 151.2093)
    expect(d1).toBe(0)
    // Sydney to Melbourne ~700km
    const d2 = haversineKm(-33.8688, 151.2093, -37.8136, 144.9631)
    expect(d2).toBeGreaterThan(600)
    expect(d2).toBeLessThan(800)
  })
})
