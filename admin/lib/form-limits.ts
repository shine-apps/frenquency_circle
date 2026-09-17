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

/** 课程标题长度上限 */
export const COURSE_TITLE_MAX = 100
/** 课程简介长度上限 */
export const COURSE_DESCRIPTION_MAX = 5000
/** 课程审核备注长度上限 */
export const COURSE_REVIEW_NOTE_MAX = 500
/** 单个课程课时数上限 */
export const COURSE_LESSONS_MAX = 30
/** 课时标题长度上限 */
export const LESSON_TITLE_MAX = 100
/** 课时简介长度上限 */
export const LESSON_DESCRIPTION_MAX = 500
/** 单个课时视频体积上限(MB),客户端预校验避免超大文件白传 */
export const COURSE_VIDEO_MAX_MB = 500
