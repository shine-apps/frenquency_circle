/**
 * 表单数量限额(**客户端安全**:不 import db,可被 "use client" 组件直接引用)。
 *
 * 后端 zod schema(`lib/circles.ts` / `lib/activities.ts`)与前端表单共用同源常量,
 * 避免两边各写一个字面量、改一处漏一处。
 */

/** 轮播 / 活动图片数量上限 */
export const COVER_IMAGES_MAX = 9

/** 圈子兴趣标签数量上限 */
export const CIRCLE_TAGS_MAX = 5
