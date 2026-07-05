import { describe, expect, it } from "vitest"
import { applyLocationPrecision } from "@/lib/match/precision"

describe("lib/match/precision - applyLocationPrecision", () => {
  describe("exact", () => {
    it("keeps 2 decimal places", () => {
      expect(applyLocationPrecision(3.14159, "exact")).toBe(3.14)
      expect(applyLocationPrecision(0.99999, "exact")).toBe(1)
      expect(applyLocationPrecision(5.005, "exact")).toBe(5.01)
    })

    it("returns 0 for distance 0", () => {
      expect(applyLocationPrecision(0, "exact")).toBe(0)
    })
  })

  describe("community", () => {
    it("rounds to nearest 0.5 km", () => {
      expect(applyLocationPrecision(3.1, "community")).toBe(3)
      expect(applyLocationPrecision(3.3, "community")).toBe(3.5)
      expect(applyLocationPrecision(3.7, "community")).toBe(3.5)
      expect(applyLocationPrecision(3.8, "community")).toBe(4)
    })

    it("returns 0 for very small distances", () => {
      expect(applyLocationPrecision(0.1, "community")).toBe(0)
      expect(applyLocationPrecision(0.3, "community")).toBe(0.5)
    })
  })

  describe("region", () => {
    it("rounds to nearest 5 km", () => {
      expect(applyLocationPrecision(7.3, "region")).toBe(5)
      expect(applyLocationPrecision(12.6, "region")).toBe(15)
      expect(applyLocationPrecision(2.4, "region")).toBe(0)
      expect(applyLocationPrecision(17.5, "region")).toBe(20)
    })

    it("returns 0 for distances under 2.5 km", () => {
      expect(applyLocationPrecision(2.4, "region")).toBe(0)
    })
  })
})
