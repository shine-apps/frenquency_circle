import type { circles } from "@/db/schema"
import type { CircleDTO } from "@/types/api"

/**
 * circles 表行 → CircleDTO 投影。
 *
 * 圈子列表 / 我创建的圈子 / 我关注的圈子 / 某用户发布的圈子共用同一份映射,
 * 避免多处手写导致字段漂移(新增字段时只需改这里)。
 */
export function toCircleDTO(row: typeof circles.$inferSelect): CircleDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    creatorId: row.creatorId,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    contactPhone: row.contactPhone,
    wechat: row.wechat,
    activityTime: row.activityTime,
    maxMembers: row.maxMembers,
    memberCount: row.memberCount,
    status: row.status,
    coverImages: row.coverImages ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
