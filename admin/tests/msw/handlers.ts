import { http, HttpResponse } from "msw"
import type {
  IResponse,
  Paginated,
  UserDTO,
  UserProfileDTO,
} from "@/types/api"

const sampleUsers: UserProfileDTO[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    email: "admin@example.com",
    name: "Admin",
    role: "ADMIN",
    privacySettings: {
      allowMatch: true,
      publicContact: true,
      locationPrecision: "exact",
    },
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    email: "user@example.com",
    name: "User",
    role: "USER",
    privacySettings: {
      allowMatch: true,
      publicContact: true,
      locationPrecision: "exact",
    },
    tags: [],
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
]

function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const start = (page - 1) * pageSize
  return {
    list: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  }
}

function envelope<T>(data: T, code = 200): IResponse<T> {
  return { code, data, message: "OK" }
}

/**
 * 仅保留 UserDTO 字段(去掉 tags),用于 /api/users GET。
 * 后续若前端期望 /api/users 返回 UserProfileDTO,可调整此处。
 */
function toUserDTO(u: UserProfileDTO): UserDTO {
  const { tags: _tags, ...rest } = u
  return rest
}

export const handlers = [
  http.get("/api/users", () => {
    return HttpResponse.json(
      envelope(paginate(sampleUsers.map(toUserDTO), 1, 20))
    )
  }),

  http.post("/api/auth/signin", () => {
    return HttpResponse.json({ ok: true })
  }),

  http.post("/api/auth/sms/send", () => {
    return HttpResponse.json(
      { code: 201, data: null, message: "验证码已发送" },
      { status: 201 }
    )
  }),
]
