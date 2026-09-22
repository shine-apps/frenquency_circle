import Dysmsapi20170525, {
  SendSmsRequest,
} from "@alicloud/dysmsapi20170525"
import { Config } from "@alicloud/openapi-client"
import type { SendResult, SmsSender } from "./sms-sender"

/**
 * 阿里云短信发送器。
 *
 * 环境变量：
 * - `ALIYUN_SMS_ACCESS_KEY_ID` / `ALIYUN_SMS_ACCESS_KEY_SECRET`：访问密钥
 * - `ALIYUN_SMS_SIGN_NAME`：签名名称
 * - `ALIYUN_SMS_TEMPLATE_CODE`：模板 CODE（模板需声明 `${code}` 变量）
 * - `ALIYUN_SMS_ENDPOINT`：可选，默认 `dysmsapi.aliyuncs.com`
 */
export class AliyunSmsSender implements SmsSender {
  private client: Dysmsapi20170525 | null = null

  private getClient(): Dysmsapi20170525 {
    if (this.client) return this.client
    const config = new Config({
      accessKeyId: process.env.ALIYUN_SMS_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIYUN_SMS_ACCESS_KEY_SECRET,
      endpoint: process.env.ALIYUN_SMS_ENDPOINT ?? "dysmsapi.aliyuncs.com",
    })
    this.client = new Dysmsapi20170525(config)
    return this.client
  }

  async send(phone: string, code: string): Promise<SendResult> {
    try {
      const client = this.getClient()
      const req = new SendSmsRequest({
        phoneNumbers: phone,
        signName: process.env.ALIYUN_SMS_SIGN_NAME,
        templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE,
        templateParam: JSON.stringify({ code }),
      })
      const resp = await client.sendSms(req)
      const body = resp?.body
      if (body?.code === "OK") {
        return { ok: true }
      }
      return {
        ok: false,
        error: body?.message ?? "Aliyun SMS returned non-OK",
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
