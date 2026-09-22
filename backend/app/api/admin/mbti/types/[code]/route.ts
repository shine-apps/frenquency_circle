import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { mbtiTypes, MBTI_TYPE_CODES, type MbtiTypeCode } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ code: string }> }

const updateTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    nickname: z.string().trim().max(50).nullable().optional(),
    description: z.string().trim().min(1).max(1000).optional(),
    strengths: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
    weaknesses: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "至少提供一个待更新字段",
  })

/**
 * PATCH /api/admin/mbti/types/[code]
 *
 * 管理后台编辑人格类型展示文案(名称/别称/描述/优劣势)。
 */
export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { code } = await context.params
  if (!new Set<string>(MBTI_TYPE_CODES).has(code)) {
    return fail(404, `未知的人格类型: ${code}`)
  }

  const body = await req.json().catch(() => null)
  const parsed = updateTypeSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }

  const [updated] = await db
    .update(mbtiTypes)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(mbtiTypes.code, code as MbtiTypeCode))
    .returning()
  if (!updated) return fail(404, "人格类型不存在")

  logger.info(LOG_PREFIX.ADMIN, "MBTI 类型文案已更新", { code, by: guard.userId })
  return ok(updated)
}
