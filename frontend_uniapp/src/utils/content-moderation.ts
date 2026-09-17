import type { CheckTextResponse, ModerationScene } from '@/api/content-moderation'
import { checkText } from '@/api/content-moderation'
import { useSettingsStore } from '@/store/settings'

/**
 * 提交前内容安全审核门禁(先审后发)。
 *
 * 仅作用于文本 UGC;图片 / 音视频本次不在范围内。后端接口
 * `/api/content/check` 内部对接微信 msgSecCheck,前端不直接接触任何密钥。
 *
 * 平台范围:内容审核是**微信小程序**的 UGC 合规要求,仅在 MP-WEIXIN 端执行
 * (编译期条件编译判定);H5 / App 端没有该平台约束,直接放行不请求审核接口。
 *
 * 开关:由后端系统设置项 `contentModerationEnabled` 控制
 * (见 GET /api/settings,管理后台「系统设置」中切换,默认不开启)。
 * - 未开启(默认)/ 开关状态未知(设置拉取失败):直接放行,不阻塞发布;
 * - 已开启:调审核接口,result === 'pass' 才放行,否则拦截;
 *   接口异常按 fail-closed 处理(拦截、不发布),保证合规不漏发;
 * - 空文本直接放行(如打卡正文选填)。
 */

/**
 * 是否在微信小程序端运行(编译期常量,条件编译按目标平台裁剪)。
 * 写法沿用 `utils/systemInfo.ts` 的惯例:声明一次,两个编译分支各赋值一次,
 * 避免 `return true` / `return false` 相邻触发 no-unreachable。
 */
let isMpWeixin: boolean
// #ifdef MP-WEIXIN
isMpWeixin = true
// #endif
// #ifndef MP-WEIXIN
isMpWeixin = false
// #endif

/** 关闭状态仅在首次告警,避免刷屏 */
let warnedDisabled = false

/**
 * 统一的"内容不合规"提示。
 * 不回显命中词(keyword),满足微信内容安全合规要求。
 */
export function showContentBlockedToast(_result?: CheckTextResponse): void {
  uni.showToast({
    title: '内容可能包含不符合社区规范的信息,请修改后重试',
    icon: 'none',
  })
}

/**
 * 门禁结果:
 * - pass:允许发布(含"审核未开启"与"文本为空"的放行);
 * - blocked:内容被判定不合规,提示用户修改;
 * - unavailable:审核服务异常(fail-closed 拦截),属服务端问题,不应提示"内容违规"。
 */
export type ModerationGateResult = 'pass' | 'blocked' | 'unavailable'

/**
 * 门禁未通过时的统一提示(按原因区分文案,避免把服务异常说成"内容违规")。
 */
export function showModerationFailureToast(result: Exclude<ModerationGateResult, 'pass'>): void {
  if (result === 'unavailable') {
    uni.showToast({ icon: 'none', title: '内容审核服务暂时不可用,请稍后重试' })
    return
  }
  showContentBlockedToast()
}

/**
 * 先审后发门禁。
 *
 * 调用方约定:在发布 / 评论前调用,仅当结果为 'pass' 时继续提交;
 * 否则调用 showModerationFailureToast(result) 并 return。
 * 多段文本(如标题 + 描述)由调用方自行拼接。
 *
 * 仅微信小程序端生效:其他平台直接返回 'pass',不拉取设置、不请求审核接口。
 *
 * @param text  待审核文本(可含多段)
 * @param scene 业务场景标识(可选,便于后端映射微信 scene 值并排障)
 */
export async function ensureTextSafe(
  text: string,
  scene?: ModerationScene,
): Promise<ModerationGateResult> {
  // 内容审核是微信小程序平台合规要求;H5 / App 端直接放行
  if (!isMpWeixin)
    return 'pass'

  // 空文本直接放行,保持现有选填逻辑
  if (!text.trim())
    return 'pass'

  // 审核开关来自后端系统设置(默认不开启);store 内 TTL 缓存命中时不会重复请求。
  // 注意:必须区分"后端明确关闭"与"状态未知(从未拉取成功)",后者不应等同于关闭,
  // 否则后端已开启审核时,冷启动拉取失败会让内容未经审核直接发布(合规漏审)。
  const settingsStore = useSettingsStore()
  await settingsStore.getSettings().catch(() => {})
  if (settingsStore.fetchedAt === 0) {
    // 从未成功拉取过设置:强制重试一次,尽量拿到真实开关
    await settingsStore.getSettings(true).catch(() => {})
  }

  if (!settingsStore.contentModerationEnabled) {
    if (settingsStore.fetchedAt === 0) {
      // 状态未知:仍按后端默认"不开启"放行,但必须记录/上报,避免开关静默失效
      console.error('[content-moderation] 无法确认审核开关(设置拉取失败),本次按未开启放行')
      return 'pass'
    }
    if (!warnedDisabled) {
      warnedDisabled = true
      console.warn(
        '[content-moderation] 后端未开启内容审核(contentModerationEnabled !== true),已跳过审核。'
        + '在管理后台「系统设置」中开启后,前端将执行"先审后发"。',
      )
    }
    return 'pass'
  }

  try {
    const res = await checkText(text, scene)
    // 任意非 pass 结果(含 risky / block / review)均视为不通过
    return (res?.result ?? 'review') === 'pass' ? 'pass' : 'blocked'
  }
  catch (e) {
    // fail-closed:审核接口异常时拦截,不发布,保证合规不漏发。
    console.error('[content-moderation] 文本审核异常,fail-closed 拦截发布:', e)
    return 'unavailable'
  }
}
