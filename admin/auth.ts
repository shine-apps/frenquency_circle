import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "./auth.config"
import { isValidPhone, normalizePhone, phoneToEmail } from "@/lib/sms/phone"
import { verifyCode } from "@/lib/sms/phone-code-service"
import { rateLimiter } from "@/lib/sms/rate-limit"
import {
  findOrCreateUserByProvider,
  findUserByAccount,
  findUserByAccountOrEmail,
  linkAccount,
} from "@/lib/auth/account-service"
import {
  code2Session,
  getAccessToken,
  getPhoneNumber,
  readWechatMpConfig,
  WechatMpError,
} from "@/lib/wechat/miniprogram"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { UserRole } from "@/types/api"

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const credentialsSchema = z.object({
  // trim:避免前后空格导致登录失败(输入法/复制粘贴常见)
  email: z.string().trim().email(),
  password: z.string().min(6),
})

const phoneCredentialsSchema = z.object({
  phone: z.string().min(1),
  code: z.string().length(6),
})

/**
 * 微信小程序登录入参（单 provider 双模式）：
 * - 仅 `code`：微信静默登录，按 openid 查 accounts 绑定关系，未绑定不建号
 * - `code` + `phoneCode`：手机号授权登录（保留原有能力），成功后自动绑定 openid
 */
const wechatMpSchema = z.object({
  code: z.string().min(1),
  phoneCode: z.string().min(1).optional(),
})

const PROVIDER_CREDENTIALS = "credentials"
const PROVIDER_PHONE = "phone"
const PROVIDER_WECHAT_MP = "wechat-miniprogram"

/**
 * 微信登录可辨识错误（Auth.js v5 约定）。
 *
 * `authorize` 抛出的普通 Error 会被 Auth.js 包装成通用 `CredentialsSignin`，
 * 原始 message 丢失（登录路由只能拿到 500「登录服务异常」）。因此改用
 * `CredentialsSignin` 子类 + 自定义 `code`，Auth.js 会保留该 `code`，
 * 由登录路由映射为可读文案。
 *
 * @see https://authjs.dev/guides/credentials#handling-errors
 */
export class WechatNotBoundSignInError extends CredentialsSignin {
  code = "wechat_not_bound"
}

/** 微信侧接口失败(code2Session / getPhoneNumber)；errcode 详情已写日志 */
export class WechatApiSignInError extends CredentialsSignin {
  code = "wechat_api_error"
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    // ============ 邮箱密码登录 ============
    Credentials({
      id: PROVIDER_CREDENTIALS,
      name: "邮箱密码",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) {
          logger.warn(LOG_PREFIX.AUTH, "Credentials login: invalid input")
          return null
        }
        const { email, password } = parsed.data

        // 先看 credentials 绑定，再回退 users.email：
        // - 历史/seed 数据可能没有 accounts 行
        // - 用户改过邮箱时也会回退(改邮箱会同步绑定，见 PATCH /api/auth/me)
        const resolved = await findUserByAccountOrEmail({
          provider: PROVIDER_CREDENTIALS,
          providerAccountId: email,
          email,
        })
        if (!resolved) {
          logger.warn(LOG_PREFIX.AUTH, "Credentials login: user not found", {
            email,
          })
          return null
        }
        const user = resolved.user

        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) {
          logger.warn(LOG_PREFIX.AUTH, "Credentials login: password mismatch", {
            userId: user.id,
          })
          return null
        }

        // 密码校验通过后再补写绑定：避免为「无法用密码登录的账号」
        //(如手机号派生用户，passwordHash 是不可用值)写入 credentials 绑定
        if (resolved.matchedBy === "email") {
          await linkAccount({
            userId: user.id,
            provider: PROVIDER_CREDENTIALS,
            providerAccountId: email,
          })
          logger.info(LOG_PREFIX.AUTH, "Credentials login: binding backfilled", {
            userId: user.id,
          })
        }

        logger.info(LOG_PREFIX.AUTH, "Credentials login success", {
          userId: user.id,
        })
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as UserRole,
        }
      },
    }),

    // ============ 手机验证码登录 ============
    Credentials({
      id: PROVIDER_PHONE,
      name: "手机验证码",
      credentials: {
        phone: { label: "手机号", type: "tel" },
        code: { label: "验证码", type: "text" },
      },
      async authorize(credentials) {
        const parsed = phoneCredentialsSchema.safeParse(credentials)
        if (!parsed.success) {
          logger.warn(LOG_PREFIX.AUTH, "Phone login: invalid input")
          return null
        }

        const { phone: rawPhone, code } = parsed.data
        if (!isValidPhone(rawPhone)) {
          logger.warn(LOG_PREFIX.AUTH, "Phone login: invalid phone format")
          return null
        }
        const phone = normalizePhone(rawPhone)

        const result = await verifyCode(phone, code)
        if (!result.ok) {
          logger.warn(LOG_PREFIX.AUTH, "Phone login: code verify failed", {
            phone,
            reason: result.reason,
          })
          return null
        }
        rateLimiter.resetPhone(phone)

        // Find-or-create 用户 + link account
        // 采用「按 provider 绑定优先、派生邮箱兜底」的解析方式：
        // 用户改过邮箱后仍能落到原账号，而不是按派生邮箱新建重复账号
        const email = phoneToEmail(phone)
        const user = await findOrCreateUserByProvider({
          email,
          name: phone,
          role: "USER",
          provider: PROVIDER_PHONE,
          providerAccountId: phone,
        })

        logger.info(LOG_PREFIX.AUTH, "Phone login success", {
          userId: user.id,
          phone,
        })
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as UserRole,
        }
      },
    }),

    // ============ 微信小程序登录（单 provider 双模式）============
    // 凭 phoneCode 是否存在区分：
    // - 无 phoneCode：微信静默登录。wx.login() 拿 js_code → code2Session 换 openid →
    //   按 accounts(wechat-miniprogram, openid) 找已绑定账号，命中即签发 token；
    //   未绑定则抛 [WECHAT] 错误，不自动建号。
    // - 有 phoneCode：手机号授权登录（保留）。<button open-type="getPhoneNumber"> 拿 phone_code →
    //   getPhoneNumber 换真实手机号 → find-or-create 用户（手机身份记 provider="phone"）→
    //   自动把 openid 绑定到该账号（仅此流程自动绑定）。
    Credentials({
      id: PROVIDER_WECHAT_MP,
      name: "微信小程序",
      credentials: {
        code: { label: "js_code", type: "text" },
        phoneCode: { label: "phone_code", type: "text" },
      },
      async authorize(credentials) {
        const parsed = wechatMpSchema.safeParse(credentials)
        if (!parsed.success) {
          logger.warn(LOG_PREFIX.WECHAT, "Login: invalid input")
          return null
        }

        let appId: string
        let appSecret: string
        let apiBase: string
        try {
          const cfg = readWechatMpConfig()
          appId = cfg.appId
          appSecret = cfg.appSecret
          apiBase = cfg.apiBase
        } catch (err) {
          logger.error(LOG_PREFIX.WECHAT, "Login: missing app config", {
            error: errMessage(err),
          })
          return null
        }

        let session
        try {
          session = await code2Session({
            appId,
            appSecret,
            code: parsed.data.code,
            apiBase,
          })
        } catch (err) {
          if (err instanceof WechatMpError) {
            logger.warn(LOG_PREFIX.WECHAT, "code2Session failed", {
              errcode: err.errcode,
              errmsg: err.errmsg,
              raw: err.raw,
            })
            // 可辨识错误码交给登录路由映射为可读文案(errcode 详情已在上方日志)
            throw new WechatApiSignInError()
          }
          logger.warn(LOG_PREFIX.WECHAT, "code2Session failed", { error: errMessage(err) })
          throw err
        }
        const openid = session.openid
        logger.info(LOG_PREFIX.WECHAT, "code2Session ok", { openid })

        // ---- 模式一：微信静默登录（无 phoneCode）----
        // 仅限已绑定微信的账号：按 accounts(provider='wechat-miniprogram',
        // providerAccountId=openid) 查绑定关系，命中即登录；未绑定直接报错、不建号。
        // 该分支不调用 getAccessToken/getPhoneNumber，省去两次外部接口调用。
        if (!parsed.data.phoneCode) {
          const bound = await findUserByAccount(PROVIDER_WECHAT_MP, openid)
          if (!bound) {
            logger.warn(LOG_PREFIX.WECHAT, "Silent login: wechat not bound", {
              openid,
            })
            // 未绑定：不自动建号，由登录路由映射为「未绑定微信」文案
            throw new WechatNotBoundSignInError()
          }
          logger.info(LOG_PREFIX.AUTH, "WeChat MP silent login success", {
            userId: bound.id,
            openid,
          })
          return {
            id: bound.id,
            email: bound.email,
            name: bound.name,
            role: bound.role as UserRole,
          }
        }

        // ---- 模式二：手机号授权登录（保留原有能力）----
        let accessToken: string
        try {
          accessToken = await getAccessToken({ appId, appSecret, apiBase })
        } catch (err) {
          logger.warn(LOG_PREFIX.WECHAT, "getAccessToken failed", {
            error: errMessage(err),
          })
          return null
        }

        let phone: string
        try {
          const r = await getPhoneNumber({
            accessToken,
            phoneCode: parsed.data.phoneCode,
          })
          phone = normalizePhone(r.purePhoneNumber)
        } catch (err) {
          if (err instanceof WechatMpError) {
            logger.warn(LOG_PREFIX.WECHAT, "getPhoneNumber failed", {
              errcode: err.errcode,
              errmsg: err.errmsg,
              raw: err.raw,
            })
            // 可辨识错误码交给登录路由;errcode 与排障提示写日志
            // (errcode=-10000 常见于开发者工具不支持真实手机号 / 未开通「获取手机号」能力)
            const hint =
              err.errcode === -10000
                ? "开发者工具不支持真实手机号,或小程序未开通「获取手机号」能力;请确认后台已开通并在真机预览/体验版测试"
                : ""
            logger.warn(LOG_PREFIX.WECHAT, "getPhoneNumber hint", { hint })
            throw new WechatApiSignInError()
          }
          logger.warn(LOG_PREFIX.WECHAT, "getPhoneNumber failed", { error: errMessage(err) })
          throw err
        }
        if (!isValidPhone(phone)) {
          logger.warn(LOG_PREFIX.WECHAT, "Phone invalid from WeChat", { phone })
          return null
        }

        // 手机身份记在 phone provider 下（与短信登录一致，后续可复用同一账号）；
        // 微信绑定关系单独记在 wechat-miniprogram + openid，避免与手机号语义混淆。
        // 解析顺序同为「accounts 绑定优先、派生邮箱兜底」
        const user = await findOrCreateUserByProvider({
          email: phoneToEmail(phone),
          name: phone,
          role: "USER",
          provider: PROVIDER_PHONE,
          providerAccountId: phone,
        })

        // 仅「微信手机号授权登录」流程自动绑定微信。
        // openid 已属他人时只记 warn 并跳过，不阻断本次登录（避免误伤一码多账号场景）；
        // 绑定自身异常同样不影响登录结果。
        try {
          const owner = await findUserByAccount(PROVIDER_WECHAT_MP, openid)
          if (!owner) {
            await linkAccount({
              userId: user.id,
              provider: PROVIDER_WECHAT_MP,
              providerAccountId: openid,
              type: "oauth",
            })
            logger.info(LOG_PREFIX.WECHAT, "WeChat auto-bound after phone login", {
              userId: user.id,
              openid,
            })
          } else if (owner.id === user.id) {
            logger.info(LOG_PREFIX.WECHAT, "WeChat already bound to current user", {
              userId: user.id,
              openid,
            })
          } else {
            logger.warn(
              LOG_PREFIX.WECHAT,
              "WeChat bound to another user, skip auto-bind",
              { userId: user.id, openid, ownerId: owner.id }
            )
          }
        } catch (err) {
          logger.error(LOG_PREFIX.WECHAT, "WeChat auto-bind failed", {
            userId: user.id,
            error: errMessage(err),
          })
        }

        logger.info(LOG_PREFIX.AUTH, "WeChat MP phone login success", {
          userId: user.id,
          phone,
        })
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as UserRole,
        }
      },
    }),

    // ============ 扩展点：未来 OAuth Provider ============
    // 示例（注释）：
    // GitHub({
    //   clientId: process.env.GITHUB_CLIENT_ID,
    //   clientSecret: process.env.GITHUB_CLIENT_SECRET,
    // }),
    //
    // 注意：OAuth 流程需要 DrizzleAdapter 或在 events.createUser / events.linkAccount
    // 中手动写 accounts 行。当前最小 accounts 方案下，接入 OAuth 需在 events 中补充：
    //   async linkAccount({ user, account }) {
    //     await linkAccountHelper({
    //       userId: user.id,
    //       provider: account.provider,
    //       providerAccountId: account.providerAccountId,
    //       type: account.type as ProviderType,
    //     })
    //   }
    // 并处理 createUser 事件。详见 Auth.js v5 文档。
  ],
})
