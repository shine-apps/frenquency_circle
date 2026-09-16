import { describe, expect, it } from "vitest"

import {
  TEACHER_AREA_ROLES,
  USER_ROLE_LABEL,
  USER_ROLE_OPTIONS,
  parseUserRoleFilter,
} from "@/lib/user-role"

/**
 * 角色常量单测。
 *
 * `TEACHER_AREA_ROLES` 是 `/teacher/` 子系统(页面守卫 + `requireTeacher`)
 * 的唯一角色来源,避免魔法数组散落在 proxy / auth.config / layout / API 四处。
 */

describe("TEACHER_AREA_ROLES", () => {
  it("allows TEACHER and ADMIN", () => {
    expect(TEACHER_AREA_ROLES).toContain("TEACHER")
    expect(TEACHER_AREA_ROLES).toContain("ADMIN")
  })

  it("does not allow USER", () => {
    expect(TEACHER_AREA_ROLES).not.toContain("USER")
  })

  it("only contains known roles", () => {
    const known = USER_ROLE_OPTIONS.map((option) => option.value)
    for (const role of TEACHER_AREA_ROLES) {
      expect(known).toContain(role)
    }
  })
})

describe("user role helpers (回归)", () => {
  it("labels every role in Chinese", () => {
    expect(USER_ROLE_LABEL.TEACHER).toBe("老师")
    expect(USER_ROLE_LABEL.ADMIN).toBe("管理员")
    expect(USER_ROLE_LABEL.USER).toBe("普通用户")
  })

  it("parses role filter case-insensitively and rejects unknown values", () => {
    expect(parseUserRoleFilter("teacher")).toBe("TEACHER")
    expect(parseUserRoleFilter("ADMIN")).toBe("ADMIN")
    expect(parseUserRoleFilter("nope")).toBeNull()
    expect(parseUserRoleFilter(null)).toBeNull()
  })
})
