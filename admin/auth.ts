import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { authConfig } from "./auth.config"
import { db } from "@/lib/db"
import { users } from "@/db/schema"
import { isValidPhone, normalizePhone, phoneToEmail } from "@/lib/sms/phone"
import { verifyCode } from "@/lib/sms/phone-code-service"
import { rateLimiter } from "@/lib/sms/rate-limit"
import {
  findOrCreateUserAndLinkAccount,
  findUserByAccount,
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

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const phoneCredentialsSchema = z.object({
  phone: z.string().min(1),
  code: z.string().length(6),
})

const wechatMpSchema = z.object({
  code: z.string().min(1),
  phoneCode: z.string().min(1),
})

const PROVIDER_CREDENTIALS = "credentials"
const PROVIDER_PHONE = "phone"
const PROVIDER_WECHAT_MP = "wechat-miniprogram"

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

        // 优先按 account 查，回退到 users 表（向后兼容已存在用户）
        const byAccount = await findUserByAccount(PROVIDER_CREDENTIALS, email)
        const user =
          byAccount ??
          (await db.query.users.findFirst({ where: eq(users.email, email) }))
        if (!user) {
          logger.warn(LOG_PREFIX.AUTH, "Credentials login: user not found", {
            email,
          })
          return null
        }

        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) {
          logger.warn(LOG_PREFIX.AUTH, "Credentials login: password mismatch", {
            userId: user.id,
          })
          return null
        }

        // 首次以新方式登录 → 补 link account
        await linkAccount({
          userId: user.id,
          provider: PROVIDER_CREDENTIALS,
          providerAccountId: email,
        })

        logger.info(LOG_PREFIX.AUTH, "Credentials login success", {
          userId: user.id,
        })
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
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
        const email = phoneToEmail(phone)
        const user = await findOrCreateUserAndLinkAccount({
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
          role: user.role,
        }
      },
    }),

    // ============ 微信小程序手机号登录 ============
    // 流程：wx.login() 拿 js_code → code2Session 换 openid/session_key →
    //       <button open-type="getPhoneNumber"> 拿 phone_code → getPhoneNumber 换真实手机号 →
    //       find-or-create user + link account (按手机号绑定)
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
            })
          } else {
            logger.warn(LOG_PREFIX.WECHAT, "code2Session failed", {
              error: errMessage(err),
            })
          }
          return null
        }
        logger.info(LOG_PREFIX.WECHAT, "code2Session ok", {
          openid: session.openid,
        })

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
            })
          } else {
            logger.warn(LOG_PREFIX.WECHAT, "getPhoneNumber failed", {
              error: errMessage(err),
            })
          }
          return null
        }
        if (!isValidPhone(phone)) {
          logger.warn(LOG_PREFIX.WECHAT, "Phone invalid from WeChat", { phone })
          return null
        }

        // 按手机号绑定：与 phone provider 行为一致；首登自动 link SMS 用户
        const user = await findOrCreateUserAndLinkAccount({
          email: phoneToEmail(phone),
          name: phone,
          role: "USER",
          provider: PROVIDER_WECHAT_MP,
          providerAccountId: phone,
        })

        logger.info(LOG_PREFIX.AUTH, "WeChat MP login success", {
          userId: user.id,
          phone,
        })
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
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
