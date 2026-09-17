import { http } from '@/http/http'

/**
 * 内容安全审核 / 举报接口契约(前端先行定义,后端后续实现)。
 *
 * 背景:微信小程序平台要求对用户产生的内容(UGC)进行内容安全审核,
 * 否则无法通过类目审核 / 上线后被下架。微信内容安全接口
 * (security.msgSecCheck 等)需要 access_token,属服务端接口,必须由后端
 * 保管小程序 secret 后调用,前端**绝不**接触任何密钥,只能调用自己的后端接口。
 *
 * 本次仅做前端配合:以下接口由后端实现,内部对接微信内容安全能力。
 *
 * 开关:前端是否执行"先审后发"由后端系统设置项 `contentModerationEnabled` 控制
 * (见 GET /api/settings,管理后台「系统设置」中切换,默认不开启)。
 *
 * 平台范围:先审后发是微信小程序平台的 UGC 合规要求,前端门禁仅在 MP-WEIXIN
 * 端执行(条件编译,见 utils/content-moderation.ts);H5 / App 端不调用本模块接口。
 *
 * 约定(与后端对齐):
 * - 审核接口为「业务成功」语义:HTTP 200 + 业务码 0/2xx 表示"审核已执行";
 *   是否通过以 data.result 为准(block/risky 均视为不通过),而非用错误码表示。
 * - 命中详情(label/labelName/traceId)仅用于后端排查,前端**不得**回显命中词。
 */

/** 审核结果(对齐微信 msgSecCheck 语义) */
export type ModerationResult = 'pass' | 'risky' | 'block' | 'review'

/** 文本审核响应(后端 data 部分) */
export interface CheckTextResponse {
  /** 审核结果:pass=通过;risky/block=不通过;review=转人工 */
  result: ModerationResult
  /** 命中标签码(可选,后端排查用,前端不回显) */
  label?: number
  /** 命中标签名称(可选,后端排查用,前端不回显) */
  labelName?: string
  /** 追踪 id(可选,便于后端定位) */
  traceId?: string
}

/** 可举报的 UGC 内容类型 */
export type ReportTargetType = 'circle' | 'checkin' | 'activity' | 'comment'

/**
 * 审核业务场景标识(后端据此映射微信 msg_sec_check v2 的 scene 值:
 * profile=1 资料 / comment=2 评论 / circle、activity=3 论坛 / checkin=4 社交日志)。
 */
export type ModerationScene = 'circle' | 'checkin' | 'activity' | 'comment' | 'profile'

/** 举报提交入参 */
export interface ReportContentInput {
  targetType: ReportTargetType
  targetId: string
  reason: string
}

/** 举报提交响应 */
export interface ReportContentResult {
  id: string
}

/**
 * 文本安全审核。后端内部对接微信 msgSecCheck,返回标准化审核结果。
 * 仅作用于文本;图片 / 音视频本次不在范围内。
 *
 * @param content 待审核文本(建议先 trim)
 * @param scene   业务场景标识,便于后端映射微信 scene 值并排障
 */
export function checkText(content: string, scene?: ModerationScene) {
  return http.post<CheckTextResponse>('/api/content/check', {
    type: 'text',
    content,
    scene,
  })
}

/**
 * 举报 UGC 内容。后端后续实现,内部生成举报记录并通知运营。
 */
export function reportContent(input: ReportContentInput) {
  return http.post<ReportContentResult>('/api/content/report', input)
}
