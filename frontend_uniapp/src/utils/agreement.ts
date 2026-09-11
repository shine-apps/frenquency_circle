/**
 * 《用户协议》/《隐私政策》的授权记录（设备维度）。
 *
 * 合规约束：在用户明确同意前，不应自动处理其身份信息（openid 等）。
 * 因此「进入登录页自动尝试微信静默登录」只对**曾经勾选过协议**的用户生效；
 * 首次使用仍需通过登录页的协议勾选 + 正常登录完成授权。
 */
const STORAGE_KEY = 'user_agreement_accepted_at'

/** 用户是否已同意协议（点选过登录页的协议勾选框） */
export function isAgreementAccepted(): boolean {
  return !!uni.getStorageSync(STORAGE_KEY)
}

/** 记录用户已同意协议 */
export function acceptAgreement() {
  uni.setStorageSync(STORAGE_KEY, Date.now())
}
