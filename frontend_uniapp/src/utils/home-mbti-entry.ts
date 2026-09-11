/**
 * 首页「测 MBTI,一键找同好」入口的关闭状态(设备维度)。
 *
 * 用户点击关闭后不再展示该区块,避免反复打扰;
 * 仅记录开关状态,不涉及用户身份信息,未登录用户同样生效。
 */
const STORAGE_KEY = 'home_mbti_entry_closed'

/** 首页 MBTI 入口是否曾被用户关闭(读取异常时按未关闭处理) */
export function isHomeMbtiEntryClosed(): boolean {
  try {
    return !!uni.getStorageSync(STORAGE_KEY)
  }
  catch {
    return false
  }
}

/** 记录用户已关闭首页 MBTI 入口 */
export function closeHomeMbtiEntry(): void {
  uni.setStorageSync(STORAGE_KEY, Date.now())
}
