import { describe, expect, it, vi } from "vitest"

// lib/courses 同时导出落库函数,import 时会拉起 @/lib/db。
// 本文件只测纯函数,把 db 打成空壳,避免无 DATABASE_URL 时连接串报错。
vi.mock("@/lib/db", () => ({ db: {} }))

import { clampPosition } from "@/lib/courses"

/**
 * `clampPosition` 单测:
 * - NaN / Infinity → 0(容错输入);
 * - 负数 → 0;
 * - 浮点数 → 向下取整(秒级精度);
 * - 超出 duration → 钳到 duration;
 * - duration=null → 不裁剪(duration 未探测时,允许上报原始位置)。
 *
 * 这个函数覆盖的是 lesson 播放位置落库前的关键安全边界,
 * 任何回归(例如把 Math.floor 换成 Math.round)都会导致位置精度漂移,
 * 因此单测独立覆盖而非依赖 recordLessonProgress 的链路测试。
 */
describe("clampPosition", () => {
  it("clamps negative numbers to 0", () => {
    expect(clampPosition(-5, 100)).toBe(0)
    expect(clampPosition(-0.001, 100)).toBe(0)
  })

  it("clamps NaN and Infinity to 0", () => {
    expect(clampPosition(Number.NaN, 100)).toBe(0)
    expect(clampPosition(Number.POSITIVE_INFINITY, 100)).toBe(0)
    expect(clampPosition(Number.NEGATIVE_INFINITY, 100)).toBe(0)
  })

  it("floors floats to integer seconds", () => {
    expect(clampPosition(5.9, 100)).toBe(5)
    expect(clampPosition(0.4, 100)).toBe(0)
  })

  it("does not clamp when position is below duration", () => {
    expect(clampPosition(50, 100)).toBe(50)
    expect(clampPosition(99, 100)).toBe(99)
  })

  it("clamps position to duration when exceeding it", () => {
    expect(clampPosition(150, 100)).toBe(100)
    expect(clampPosition(100.5, 100)).toBe(100)
  })

  it("returns the original value when duration is null (unprobed)", () => {
    // 时长未探测时不应误裁剪;客户端 seek 时按真实 duration 自行判断
    expect(clampPosition(150, null)).toBe(150)
    expect(clampPosition(0, null)).toBe(0)
  })

  it("returns 0 exactly at zero position", () => {
    expect(clampPosition(0, 100)).toBe(0)
    expect(clampPosition(0, null)).toBe(0)
  })
})