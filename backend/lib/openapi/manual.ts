import type {
  EndpointDoc,
  OpenApiRequestBody,
  OpenApiResponse,
  OpenApiSchema,
  OpenApiSecurityScheme,
  OpenApiTag,
} from "./types"

/**
 * OpenAPI 文档的手工维护部分:文档元信息、分组、鉴权方案,以及核心端点的
 * 请求体 / 响应补充。
 *
 * 端点的 **路径 / 方法 / 摘要 / 鉴权要求** 由 `pnpm openapi:generate` 扫描
 * `app/api/**\/route.ts` 自动生成(描述取自路由文件里的 JSDoc 注释),
 * 本文件只维护「代码里读不出来」的信息,避免与实现重复。
 */

export const openApiInfo = {
  title: "趣邻圈 API",
  description: [
    "「趣邻圈」后端 REST API(Next.js Route Handlers)。",
    "",
    "## 统一响应信封",
    "",
    "所有接口返回 `IResponse<T>`:`{ code, data, message, details? }`。",
    "`code` 与 HTTP 状态码同源(成功为 `200`;创建类接口可能为 `201`),`message` 为可读文案。",
    "客户端判定成功应接受 **2xx**,不要硬编码 200。",
    "",
    "## 鉴权",
    "",
    "| 方式 | 适用端 | 说明 |",
    "| --- | --- | --- |",
    "| `sessionCookie` | 管理后台 / 教师后台(浏览器同源) | Auth.js JWT 会话 cookie |",
    "| `bearerAuth` | 小程序 / H5(跨端客户端) | `POST /api/auth/login/*` 返回的 JWT |",
    "",
    "管理端接口(`/api/admin/*`)一律要求 `ADMIN` 角色;",
    "教师端接口(`/api/teacher/*`)放行 `TEACHER` / `ADMIN`;",
    "标注为登录态的普通接口由 `requireSession` 守卫(401 = 未登录,403 = 越权)。",
    "",
    "## 分页",
    "",
    "列表接口统一 `?page=&pageSize=`,默认 `page=1`、`pageSize=20`,`pageSize` 上限 100。",
    "响应 `data` 为 `Paginated<T>`:`{ list, total, page, pageSize }`。",
    "",
    "## 约定",
    "",
    "- 时间字段均为 ISO 8601 字符串;id 均为 uuid。",
    "- 文件上传不经过后端:先 `GET /api/upload/cos-credentials` 取 scoped STS 凭证,再由客户端直传腾讯云 COS。",
    "- 文本 UGC 发布前需通过 `POST /api/content/check`(后端权威开关,未开启则直接放行)。",
    "- 接口返回的 `details` 通常为 zod 校验错误详情,仅用于排障。",
  ].join("\n"),
}

export const openApiServers = [
  {
    url: "/",
    description: "当前部署同源(相对路径,Swagger UI 按页面地址解析)",
  },
]

export const openApiTags: OpenApiTag[] = [
  { name: "认证", description: "登录 / 登出 / 短信验证码 / 当前登录用户" },
  { name: "用户", description: "用户资料、关注、隐私设置、微信绑定、课时进度" },
  { name: "兴趣标签", description: "标签搜索 / 分类树 / 自定义标签" },
  { name: "圈子", description: "圈子 CRUD、联系、关注、打卡列表" },
  { name: "活动", description: "活动列表与详情" },
  { name: "课程", description: "视频课程(C 端只读)" },
  { name: "打卡", description: "打卡广场 / 我的打卡" },
  { name: "招呼", description: "联系请求(打招呼)的发起与处理" },
  { name: "位置匹配", description: "同趣的人 / 同趣的圈子" },
  { name: "通知", description: "站内通知列表与未读数" },
  { name: "MBTI", description: "MBTI 题目 / 提交 / 结果与历史" },
  { name: "兴趣热点", description: "热门兴趣标签" },
  { name: "内容审核", description: "文本 UGC 安全检测(先审后发门禁)" },
  { name: "文件上传", description: "COS 直传 STS 凭证签发" },
  { name: "系统", description: "健康检查 / 系统设置 / 逆地理编码 / 运行时配置 / 微信 JS-SDK" },
  { name: "教师认证", description: "教师认证申请与审核" },
  { name: "教师后台", description: "教师工作台(圈子 / 活动 / 课程),需 TEACHER 或 ADMIN" },
  { name: "管理后台", description: "运营管理端,需 ADMIN" },
]

export const openApiSecuritySchemes: Record<string, OpenApiSecurityScheme> = {
  sessionCookie: {
    type: "apiKey",
    in: "cookie",
    name: "authjs.session-token",
    description:
      "浏览器同源登录会话(Auth.js JWT cookie;HTTPS 部署下为 `__Secure-authjs.session-token`)。管理后台 / 教师后台走此方式。",
  },
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description:
      "Token 模式登录(小程序 / H5)返回的 JWT,请求头 `Authorization: Bearer <token>`。",
  },
}

/** 请求路径首段 → 文档分组名(未命中时原样使用首段) */
export const pathTagLabels: Record<string, string> = {
  auth: "认证",
  users: "用户",
  "hobby-tags": "兴趣标签",
  circles: "圈子",
  activities: "活动",
  courses: "课程",
  checkins: "打卡",
  "contact-requests": "招呼",
  locations: "位置匹配",
  notifications: "通知",
  mbti: "MBTI",
  interests: "兴趣热点",
  content: "内容审核",
  upload: "文件上传",
  settings: "系统",
  geo: "系统",
  config: "系统",
  health: "系统",
  wechat: "系统",
  // 文档端点自身(GET /api/openapi),与运行时配置同组
  openapi: "系统",
  "teacher-applications": "教师认证",
  teacher: "教师后台",
  admin: "管理后台",
}

// ---- 以下为构造 schema 的小工具,让端点补充信息保持紧凑可读 ----

/** 对象 schema 简写 */
function obj(
  properties: Record<string, OpenApiSchema>,
  required?: string[],
  description?: string
): OpenApiSchema {
  return {
    type: "object",
    ...(description ? { description } : {}),
    ...(required ? { required } : {}),
    properties,
  }
}

/** application/json 请求体简写 */
function jsonBody(schema: OpenApiSchema, description?: string, required = true): OpenApiRequestBody {
  return { description, required, content: { "application/json": { schema } } }
}

/** 成功响应简写(内联 IResponse 信封,`data` 为具体结构) */
function okResponse(dataSchema: OpenApiSchema, description = "成功"): OpenApiResponse {
  return {
    description,
    content: {
      "application/json": {
        schema: obj(
          {
            code: { type: "integer", example: 200 },
            data: dataSchema,
            message: { type: "string", example: "OK" },
          },
          ["code", "data", "message"]
        ),
      },
    },
  }
}

/** 分页成功响应简写 */
function pagedResponse(itemRef: string, description = "分页成功"): OpenApiResponse {
  return okResponse(
    {
      type: "object",
      required: ["list", "total", "page", "pageSize"],
      properties: {
        list: { type: "array", items: { $ref: itemRef } },
        total: { type: "integer" },
        page: { type: "integer" },
        pageSize: { type: "integer" },
      },
    },
    description
  )
}

/** `$ref` 简写 */
function ref(name: string): OpenApiSchema {
  return { $ref: `#/components/schemas/${name}` }
}

const q = (
  name: string,
  schema: OpenApiSchema,
  description: string,
  required = false
): { name: string; in: "query"; description: string; required: boolean; schema: OpenApiSchema } => ({
  name,
  in: "query",
  description,
  required,
  schema,
})

/**
 * 核心端点的补充信息(按 `method` + `path` 匹配,path 使用 Next.js 的 `[param]` 写法)。
 *
 * 未登记的端点完全由源码 JSDoc 自动生成,功能上不会缺失,只是请求体 / 参数
 * 描述较粗。新增写操作端点时,建议在此登记请求体结构。
 */
export const operationDocs: EndpointDoc[] = [
  // ---- 认证 ----
  {
    method: "post",
    path: "/api/auth/sms/send",
    requestBody: jsonBody(obj({ phone: { type: "string", example: "13800138000", description: "中国大陆手机号" } }, ["phone"])),
    responses: {
      "201": okResponse({ type: "null" }, "验证码已发送(不泄露手机号是否已注册)"),
      "400": { description: "手机号格式不正确" },
      "429": { description: "触发限流(60s 冷却 / 小时配额)" },
      "502": { description: "短信服务商失败" },
    },
  },
  {
    method: "post",
    path: "/api/auth/login/credentials",
    requestBody: jsonBody(
      obj(
        {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password" },
        },
        ["email", "password"]
      )
    ),
    responses: {
      "200": okResponse(ref("AuthLoginResponse"), "登录成功"),
      "401": { description: "邮箱或密码错误" },
    },
  },
  {
    method: "post",
    path: "/api/auth/login/phone",
    requestBody: jsonBody(
      obj(
        { phone: { type: "string" }, code: { type: "string", description: "6 位短信验证码" } },
        ["phone", "code"]
      )
    ),
    responses: {
      "200": okResponse(ref("AuthLoginResponse"), "登录成功"),
      "401": { description: "手机号或验证码错误" },
    },
  },
  {
    method: "post",
    path: "/api/auth/wechat-miniprogram/login",
    requestBody: jsonBody(
      obj(
        {
          code: { type: "string", description: "wx.login() 返回的 js_code" },
          phoneCode: {
            type: "string",
            description: "getPhoneNumber 按钮返回的 phone_code;不传则为静默登录(要求已绑定)",
          },
        },
        ["code"]
      )
    ),
    responses: {
      "200": okResponse(ref("AuthLoginResponse"), "登录成功"),
      "400": { description: "参数缺失 / 微信侧错误 / 该微信未绑定账号" },
      "401": { description: "登录失败" },
    },
  },
  {
    method: "get",
    path: "/api/auth/me",
    responses: { "200": okResponse(ref("UserProfileDTO")) },
  },

  // ---- 用户 ----
  {
    method: "patch",
    path: "/api/users/me/profile",
    requestBody: jsonBody(
      obj(
        {
          name: { type: "string" },
          role: { type: "string", enum: ["USER", "TEACHER"] },
          phone: { type: "string" },
          practiceYears: { type: "integer" },
          activityLevel: { type: "string", enum: ["low", "medium", "high"] },
        },
        undefined,
        "字段均可选,仅传需要更新的字段"
      ),
      undefined,
      false
    ),
  },
  {
    method: "put",
    path: "/api/users/me/hobby-tags",
    requestBody: jsonBody(
      obj({ tags: { type: "array", items: { type: "string" }, description: "1-10 个标签名(全量替换)" } }, ["tags"])
    ),
  },
  {
    method: "put",
    path: "/api/users/me/privacy",
    requestBody: jsonBody(ref("PrivacySettings")),
  },
  {
    method: "post",
    path: "/api/users/me/phone/verify",
    requestBody: jsonBody(
      obj({ phone: { type: "string" }, code: { type: "string", description: "6 位短信验证码" } }, ["phone", "code"]),
      "换绑手机号"
    ),
  },
  {
    method: "patch",
    path: "/api/users/[id]/password",
    requestBody: jsonBody(
      obj({ password: { type: "string", description: "6-72 位(bcrypt 输入上限 72 字节)" } }, ["password"]),
      "管理员重置用户密码"
    ),
  },
  {
    method: "get",
    path: "/api/users/[id]/profile",
    responses: { "200": okResponse(ref("PublicUserProfileDTO")) },
  },

  // ---- 圈子 / 活动 / 课程 / 打卡 ----
  {
    method: "get",
    path: "/api/circles",
    parameters: [q("creatorId", { type: "string", format: "uuid" }, "发布者用户 id(必传)", true)],
    responses: { "200": pagedResponse("#/components/schemas/CircleDTO") },
  },
  {
    method: "post",
    path: "/api/circles",
    requestBody: jsonBody(
      obj(
        {
          title: { type: "string", description: "2-50 字" },
          description: { type: "string", description: "10-1000 字" },
          tags: { type: "array", items: { type: "string" }, description: "1-N 个已审核通过的标签名" },
          latitude: { type: "number" },
          longitude: { type: "number" },
          address: { type: "string" },
          contactPhone: { type: "string", description: "与 wechat 至少填一项" },
          wechat: { type: "string", description: "与 contactPhone 至少填一项" },
          activityTime: { type: "string" },
          maxMembers: { type: "integer" },
          coverImages: { type: "array", items: { type: "string" }, description: "最多 9 张" },
        },
        ["title", "description", "tags", "latitude", "longitude", "address"]
      )
    ),
    responses: {
      "201": okResponse(
        obj({ circleId: { type: "string", format: "uuid" }, status: { type: "string", example: "pending" } }),
        "创建成功(待管理员审核)"
      ),
      "400": { description: "参数错误 / 标签不存在或未通过审核" },
      "429": { description: "24 小时内创建数量已达上限" },
    },
  },
  {
    method: "post",
    path: "/api/checkins",
    requestBody: jsonBody(
      obj(
        {
          content: { type: "string", description: "正文(可空,允许纯媒体打卡)" },
          circleId: { type: "string", format: "uuid" },
          tags: { type: "array", items: { type: "string" } },
          images: { type: "array", items: { type: "string" }, description: "图片 URL,最多 9 张" },
          videoUrl: { type: "string", description: "视频 URL,与 images 互斥" },
        },
        undefined,
        "content / images / videoUrl 至少一项;视频与图片不能同时存在"
      )
    ),
  },
  {
    method: "post",
    path: "/api/teacher/activities",
    requestBody: jsonBody(
      obj(
        {
          title: { type: "string", description: "1-100 字" },
          description: { type: "string" },
          startTime: { type: "string", format: "date-time", description: "ISO 8601" },
          registrationDeadline: { type: "string", format: "date-time", description: "须早于 startTime" },
          contactPhone: { type: "string" },
          coverImages: { type: "array", items: { type: "string" }, description: "最多 9 张" },
        },
        ["title", "description", "startTime", "registrationDeadline"]
      )
    ),
  },
  {
    method: "post",
    path: "/api/teacher/courses",
    requestBody: jsonBody(
      obj(
        {
          title: { type: "string", description: "2 字以上" },
          description: { type: "string" },
          coverImages: { type: "array", items: { type: "string" }, description: "最多 9 张" },
          tags: { type: "array", items: { type: "string" } },
          lessons: {
            type: "array",
            description: "课时列表(按提交顺序)",
            items: obj({
              title: { type: "string" },
              description: { type: "string" },
              videoUrl: { type: "string" },
              durationSeconds: { type: "integer" },
            }),
          },
        },
        ["title", "description", "lessons"]
      )
    ),
  },

  // ---- 交互 ----
  {
    method: "post",
    path: "/api/contact-requests",
    requestBody: jsonBody(
      obj(
        {
          toUserId: { type: "string", format: "uuid" },
          message: { type: "string", description: "留言(≤100 字,可空)" },
        },
        ["toUserId"]
      )
    ),
  },
  {
    method: "post",
    path: "/api/content/check",
    requestBody: jsonBody(
      obj(
        {
          type: { type: "string", enum: ["text"] },
          content: { type: "string", description: "1-5000 字符" },
          scene: { type: "string", enum: ["circle", "checkin", "activity", "comment", "profile"] },
        },
        ["type", "content"]
      )
    ),
    responses: {
      "200": okResponse(ref("ContentCheckDTO")),
      "503": { description: "审核服务不可用(未绑定微信 / 微信侧异常,fail-closed)" },
    },
  },
  {
    method: "post",
    path: "/api/hobby-tags/custom",
    requestBody: jsonBody(
      obj({
        name: { type: "string", description: "1-30 字符" },
        category: { type: "string", description: "一级大类名(可选)" },
        subCategory: { type: "string", description: "二级中类名(可选)" },
      }, ["name"])
    ),
  },
  {
    method: "get",
    path: "/api/hobby-tags/search",
    parameters: [
      q("q", { type: "string" }, "关键词(空则返回热门 top 10)"),
      q("limit", { type: "integer", default: 10 }, "返回条数上限(最大 50)"),
    ],
  },
  {
    method: "get",
    path: "/api/locations/match-people",
    parameters: [
      q("latitude", { type: "number" }, "当前纬度", true),
      q("longitude", { type: "number" }, "当前经度", true),
      q("tags", { type: "string" }, "兴趣标签名(逗号分隔)"),
      q("rangeKm", { type: "number" }, "搜索半径(km)"),
    ],
    responses: { "200": pagedResponse("#/components/schemas/MatchPersonDTO") },
  },
  {
    method: "get",
    path: "/api/locations/match-circles",
    parameters: [
      q("latitude", { type: "number" }, "当前纬度", true),
      q("longitude", { type: "number" }, "当前经度", true),
      q("tags", { type: "string" }, "兴趣标签名(逗号分隔)"),
      q("rangeKm", { type: "number" }, "搜索半径(km)"),
    ],
    responses: { "200": pagedResponse("#/components/schemas/MatchCircleDTO") },
  },
  {
    method: "post",
    path: "/api/mbti/submit",
    requestBody: jsonBody(
      obj({ answers: { type: "array", items: { type: "string", enum: ["A", "B"] } } }, ["answers"])
    ),
    responses: { "200": okResponse(ref("MbtiSubmitResultDTO")) },
  },
  {
    method: "get",
    path: "/api/upload/cos-credentials",
    responses: { "200": okResponse(ref("CosCredentials"), "STS 临时凭证") },
  },
]
