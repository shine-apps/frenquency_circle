import type { OpenApiSchema } from "./types"

/**
 * `components.schemas`:核心业务 DTO 定义。
 *
 * 与 `types/api.ts` 保持同构(字段名 / 可空性 / 枚举取值一致),只收录对外
 * 响应中出现的主要结构;新增 DTO 时在此追加,而不是在端点里展开内联 schema。
 */

const DATE_TIME: OpenApiSchema = { type: "string", format: "date-time" }
const UUID: OpenApiSchema = { type: "string", format: "uuid" }
const STRING_ARRAY: OpenApiSchema = { type: "array", items: { type: "string" } }
const NULLABLE_STRING: OpenApiSchema = { type: "string", nullable: true }

export const openApiSchemas: Record<string, OpenApiSchema> = {
  /** 统一响应信封:HTTP 状态码与 code 同源 */
  IResponse: {
    type: "object",
    description:
      "统一响应信封。成功时 `code` 为 200/201 且 `message=\"OK\"`;失败时 `code` 为 4xx/5xx,`message` 为可读错误文案。",
    required: ["code", "data", "message"],
    properties: {
      code: { type: "integer", description: "业务码(镜像 HTTP 状态码)" },
      data: { type: "object", nullable: true, description: "业务数据;失败为 null" },
      message: { type: "string", description: "成功为 OK,失败为错误描述" },
      details: {
        type: "object",
        nullable: true,
        description: "校验失败等场景附带(zod flatten / treeify 结果)",
      },
    },
  },

  /** 分页信封:与 `Paginated<T>` 同构 */
  Paginated: {
    type: "object",
    required: ["list", "total", "page", "pageSize"],
    properties: {
      list: { type: "array", items: { type: "object" }, description: "当前页数据" },
      total: { type: "integer", description: "总条数(同 where 条件统计)" },
      page: { type: "integer", description: "当前页码(从 1 开始)" },
      pageSize: { type: "integer", description: "每页条数(默认 20,上限 100)" },
    },
  },

  PrivacySettings: {
    type: "object",
    description: "隐私设置(users.privacySettings JSONB)",
    required: ["allowMatch", "publicContact", "locationPrecision"],
    properties: {
      allowMatch: { type: "boolean", description: "是否允许被同趣匹配检索到" },
      publicContact: { type: "boolean", description: "是否公开联系方式(受联系可见规则约束)" },
      locationPrecision: {
        type: "string",
        enum: ["exact", "community", "region"],
        description: "距离脱敏档位:精确 / 0.5km / 5km",
      },
    },
  },

  LocationPoint: {
    type: "object",
    properties: {
      latitude: { type: "number", description: "纬度" },
      longitude: { type: "number", description: "经度" },
    },
  },

  UserDTO: {
    type: "object",
    required: ["id", "email", "name", "role", "privacySettings", "createdAt", "updatedAt"],
    properties: {
      id: UUID,
      email: { type: "string", format: "email" },
      name: { type: "string" },
      role: { type: "string", enum: ["ADMIN", "USER", "TEACHER"] },
      avatarUrl: NULLABLE_STRING,
      phone: { ...NULLABLE_STRING, description: "手机号(仅本人可见,不进入对外响应)" },
      wechat: { ...NULLABLE_STRING, description: "微信号(人-人联系链路中唯一可对外展示的联系方式)" },
      gender: { type: "string", enum: ["male", "female", "other"], nullable: true },
      birthday: { ...NULLABLE_STRING, description: "生日(YYYY-MM-DD)" },
      practiceYears: { type: "integer", nullable: true, description: "练习年限" },
      activityLevel: { type: "string", enum: ["low", "medium", "high"] },
      privacySettings: { $ref: "#/components/schemas/PrivacySettings" },
      location: {
        allOf: [{ $ref: "#/components/schemas/LocationPoint" }],
        nullable: true,
      },
      address: { ...NULLABLE_STRING, description: "逆地理编码地址" },
      tags: { ...STRING_ARRAY, description: "兴趣标签名称数组(仅列表类查询携带)" },
      createdAt: DATE_TIME,
      updatedAt: DATE_TIME,
    },
  },

  UserProfileDTO: {
    allOf: [
      { $ref: "#/components/schemas/UserDTO" },
      {
        type: "object",
        required: ["tags"],
        properties: { tags: STRING_ARRAY },
      },
    ],
  },

  ContactVisibility: {
    type: "object",
    description:
      "联系方式可见性。仅「本人查看自己」或「双方已互相接受招呼」时可见;优先微信号,缺失时兜底手机号。",
    required: ["visible", "wechat", "phone", "contactType", "reason"],
    properties: {
      visible: { type: "boolean" },
      wechat: { ...NULLABLE_STRING, description: "可见的微信号(visible 且存在时)" },
      phone: { ...NULLABLE_STRING, description: "微信号缺失时的兜底联系方式" },
      contactType: { type: "string", enum: ["wechat", "phone"], nullable: true },
      reason: {
        type: "string",
        enum: ["self", "accepted", "need_request", "not_provided"],
      },
    },
  },

  UserRelation: {
    type: "object",
    description: "当前登录用户与目标用户的关系快照",
    properties: {
      followed: { type: "boolean", description: "我是否已关注对方" },
      contactStatus: {
        type: "string",
        enum: ["none", "pending_sent", "pending_received", "accepted", "rejected"],
      },
      requestId: { ...NULLABLE_STRING, description: "pending_received 时为待处理请求 id" },
    },
  },

  PublicUserProfileDTO: {
    type: "object",
    description: "公开用户主页(不含 email / phone / privacySettings)",
    required: ["id", "name", "role", "tags", "createdAt", "contact", "relation"],
    properties: {
      id: UUID,
      name: { type: "string" },
      avatarUrl: NULLABLE_STRING,
      role: { type: "string", enum: ["ADMIN", "USER", "TEACHER"] },
      tags: STRING_ARRAY,
      activityLevel: { type: "string", enum: ["low", "medium", "high"] },
      practiceYears: { type: "integer", nullable: true },
      address: NULLABLE_STRING,
      createdAt: DATE_TIME,
      contact: { $ref: "#/components/schemas/ContactVisibility" },
      relation: { $ref: "#/components/schemas/UserRelation" },
    },
  },

  AuthUser: {
    type: "object",
    description: "JWT 中携带的用户身份",
    required: ["id", "email", "name", "role"],
    properties: {
      id: UUID,
      email: { type: "string", format: "email" },
      name: { type: "string" },
      role: { type: "string", enum: ["ADMIN", "USER", "TEACHER"] },
    },
  },

  AuthLoginResponse: {
    type: "object",
    description: "Token 模式登录响应(小程序 / H5),后续请求以 Bearer 携带",
    required: ["token", "user", "expiresIn"],
    properties: {
      token: { type: "string", description: "JWT" },
      user: { $ref: "#/components/schemas/AuthUser" },
      expiresIn: { type: "integer", description: "有效期(秒),与会话 maxAge 同源" },
    },
  },

  WechatBindStateDTO: {
    type: "object",
    required: ["bound"],
    properties: { bound: { type: "boolean", description: "当前账号是否已绑定微信" } },
  },

  ContentCheckDTO: {
    type: "object",
    required: ["result"],
    properties: {
      result: {
        type: "string",
        enum: ["pass", "risky", "block", "review"],
        description: "任意非 pass 结果前端均应视为不通过",
      },
      label: { type: "integer", description: "命中标签码(后端排查用)" },
      labelName: { type: "string" },
      traceId: { type: "string", description: "微信 trace_id" },
    },
  },

  TagDTO: {
    type: "object",
    required: ["id", "name", "category", "status", "createdAt", "updatedAt"],
    properties: {
      id: UUID,
      name: { type: "string", description: "叶子标签名(如「太极拳」)" },
      category: { type: "string", description: "一级大类名" },
      subCategory: { ...NULLABLE_STRING, description: "二级中类名;level=1 叶子大类时为 null" },
      categoryId: { type: "string", format: "uuid", nullable: true },
      categoryLevel: { type: "integer", enum: [1, 2], nullable: true },
      pinyin: NULLABLE_STRING,
      pinyinInitials: NULLABLE_STRING,
      status: { type: "string", enum: ["pending", "approved", "rejected"] },
      createdBy: { type: "string", format: "uuid", nullable: true },
      createdAt: DATE_TIME,
      updatedAt: DATE_TIME,
    },
  },

  CategoryNode: {
    type: "object",
    description: "分类树节点(递归结构)",
    required: ["id", "name", "slug", "level", "sortOrder"],
    properties: {
      id: UUID,
      name: { type: "string" },
      slug: { type: "string" },
      level: { type: "integer", description: "1=一级大类,2=二级中类" },
      parentId: { type: "string", format: "uuid", nullable: true },
      sortOrder: { type: "integer" },
      children: { type: "array", items: { $ref: "#/components/schemas/CategoryNode" } },
    },
  },

  CircleDTO: {
    type: "object",
    required: ["id", "title", "creatorId", "status", "memberCount", "createdAt", "updatedAt"],
    properties: {
      id: UUID,
      title: { type: "string" },
      description: { type: "string" },
      creatorId: UUID,
      latitude: { type: "number" },
      longitude: { type: "number" },
      address: { type: "string" },
      contactPhone: NULLABLE_STRING,
      wechat: NULLABLE_STRING,
      activityTime: { ...NULLABLE_STRING, description: "活动时间(文本,由创建者填写)" },
      maxMembers: { type: "integer", nullable: true },
      memberCount: { type: "integer" },
      status: {
        type: "string",
        enum: ["pending", "active", "offline", "violated", "deleted"],
        description: "pending 需管理员审核后上线",
      },
      coverImages: { ...STRING_ARRAY, description: "轮播图片 URL(0-9 张)" },
      createdAt: DATE_TIME,
      updatedAt: DATE_TIME,
    },
  },

  CircleDetailDTO: {
    allOf: [
      { $ref: "#/components/schemas/CircleDTO" },
      {
        type: "object",
        required: ["creator", "tags", "contactCount", "isFollowed", "followCount"],
        properties: {
          creator: {
            type: "object",
            properties: {
              id: UUID,
              name: { type: "string" },
              avatarUrl: NULLABLE_STRING,
            },
          },
          tags: STRING_ARRAY,
          contactCount: { type: "integer", description: "被联系次数" },
          isFollowed: { type: "boolean", description: "当前用户是否已关注" },
          followCount: { type: "integer" },
        },
      },
    ],
  },

  ActivityDTO: {
    type: "object",
    required: ["id", "creatorId", "title", "startTime", "status", "createdAt", "updatedAt"],
    properties: {
      id: UUID,
      creatorId: UUID,
      title: { type: "string" },
      description: { type: "string", description: "净化后的富文本 HTML" },
      startTime: { ...DATE_TIME, description: "活动起始时间" },
      registrationDeadline: { ...DATE_TIME, description: "报名截止时间" },
      contactPhone: NULLABLE_STRING,
      coverImages: { ...STRING_ARRAY, description: "轮播图片 URL(0-9 张)" },
      status: { type: "string", enum: ["active", "cancelled"] },
      createdAt: DATE_TIME,
      updatedAt: DATE_TIME,
    },
  },

  CourseLessonDTO: {
    type: "object",
    required: ["id", "title", "videoUrl", "sortOrder"],
    properties: {
      id: UUID,
      title: { type: "string" },
      description: { type: "string" },
      videoUrl: { type: "string", description: "课时视频 COS 公网 URL" },
      durationSeconds: { type: "integer", nullable: true },
      sortOrder: { type: "integer" },
    },
  },

  PublicCourseDTO: {
    type: "object",
    description: "用户端课程(列表场景 lessons 恒为 [])",
    required: ["id", "title", "lessonCount", "totalDurationSeconds", "isFollowed", "createdAt"],
    properties: {
      id: UUID,
      title: { type: "string" },
      description: { type: "string" },
      coverImages: STRING_ARRAY,
      tags: STRING_ARRAY,
      lessons: { type: "array", items: { $ref: "#/components/schemas/CourseLessonDTO" } },
      lessonCount: { type: "integer" },
      totalDurationSeconds: {
        type: "integer",
        description: "课程总时长(秒),0 表示无课时或时长未知",
      },
      isFollowed: { type: "boolean" },
      createdAt: DATE_TIME,
      updatedAt: DATE_TIME,
    },
  },

  CheckinDTO: {
    type: "object",
    required: ["id", "userId", "author", "tags", "images", "createdAt"],
    properties: {
      id: UUID,
      userId: UUID,
      author: {
        type: "object",
        properties: {
          id: UUID,
          name: { type: "string" },
          avatarUrl: NULLABLE_STRING,
        },
      },
      content: { ...NULLABLE_STRING, description: "打卡正文" },
      circleId: { type: "string", format: "uuid", nullable: true },
      circleTitle: NULLABLE_STRING,
      tags: STRING_ARRAY,
      images: STRING_ARRAY,
      videoUrl: { ...NULLABLE_STRING, description: "视频 URL(与 images 互斥)" },
      createdAt: DATE_TIME,
    },
  },

  MatchPersonDTO: {
    type: "object",
    required: ["userId", "name", "distanceKm", "tags", "activityLevel"],
    properties: {
      userId: UUID,
      name: { type: "string" },
      avatarUrl: NULLABLE_STRING,
      distanceKm: { type: "number", description: "距离(km,已按对方隐私档位脱敏)" },
      tags: { ...STRING_ARRAY, description: "与查询标签重合的兴趣" },
      activityLevel: { type: "string", enum: ["low", "medium", "high"] },
      practiceYears: { type: "integer", nullable: true },
    },
  },

  MatchCircleDTO: {
    type: "object",
    required: ["circleId", "title", "distanceKm", "tags", "memberCount", "address"],
    properties: {
      circleId: UUID,
      title: { type: "string" },
      distanceKm: { type: "number" },
      tags: STRING_ARRAY,
      activityTime: NULLABLE_STRING,
      memberCount: { type: "integer" },
      maxMembers: { type: "integer", nullable: true },
      address: { type: "string" },
    },
  },

  ContactRequestDTO: {
    type: "object",
    required: ["id", "fromUser", "toUser", "status", "createdAt"],
    properties: {
      id: UUID,
      fromUser: { $ref: "#/components/schemas/UserBrief" },
      toUser: { $ref: "#/components/schemas/UserBrief" },
      message: { ...NULLABLE_STRING, description: "一次性自我介绍" },
      status: { type: "string", enum: ["pending", "accepted", "rejected"] },
      createdAt: DATE_TIME,
      respondedAt: { ...DATE_TIME, nullable: true },
    },
  },

  UserBrief: {
    type: "object",
    required: ["id", "name"],
    properties: {
      id: UUID,
      name: { type: "string" },
      avatarUrl: NULLABLE_STRING,
    },
  },

  NotificationDTO: {
    type: "object",
    required: ["id", "type", "title", "content", "linkTarget", "createdAt"],
    properties: {
      id: UUID,
      actorId: { type: "string", format: "uuid", nullable: true },
      entityType: { type: "string", enum: ["circle", "user", "course"], nullable: true },
      entityId: { type: "string", format: "uuid", nullable: true },
      type: {
        type: "string",
        enum: [
          "circle_review",
          "circle_review_result",
          "circle_followed",
          "contact_request",
          "contact_accepted",
          "user_followed",
          "course_followed",
        ],
      },
      title: { type: "string" },
      content: { type: "string" },
      linkUrl: NULLABLE_STRING,
      linkTarget: { type: "string", enum: ["miniprogram", "admin"] },
      readAt: { ...DATE_TIME, nullable: true },
      createdAt: DATE_TIME,
    },
  },

  MbtiQuestionDTO: {
    type: "object",
    required: ["id", "dimension", "stem", "optionA", "optionB", "sortOrder"],
    properties: {
      id: UUID,
      dimension: { type: "string", enum: ["EI", "SN", "TF", "JP"] },
      stem: { type: "string", description: "题干" },
      optionA: { type: "string" },
      optionB: { type: "string" },
      sortOrder: { type: "integer" },
    },
  },

  MbtiSubmitResultDTO: {
    type: "object",
    required: ["resultType", "dimensionScores", "type", "recommendations", "saved"],
    properties: {
      resultType: { type: "string", description: "四字母人格代码,如 INFP" },
      dimensionScores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dimension: { type: "string", enum: ["EI", "SN", "TF", "JP"] },
            first: { type: "string" },
            second: { type: "string" },
            firstCount: { type: "integer" },
            secondCount: { type: "integer" },
          },
        },
      },
      type: {
        type: "object",
        properties: {
          code: { type: "string" },
          name: { type: "string" },
          nickname: { ...NULLABLE_STRING },
          description: { type: "string" },
          strengths: STRING_ARRAY,
          weaknesses: STRING_ARRAY,
        },
      },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            hobbyTagId: UUID,
            tagName: { type: "string" },
            categoryName: NULLABLE_STRING,
            matchProbability: { type: "integer", description: "匹配权重 0-100" },
            reason: { type: "string" },
          },
        },
      },
      saved: { type: "boolean", description: "登录用户为 true(已存历史)" },
      recordId: { type: "string", format: "uuid", nullable: true },
    },
  },

  CourseLessonProgressDTO: {
    type: "object",
    required: ["lessonId", "positionSeconds", "updatedAt"],
    properties: {
      lessonId: UUID,
      positionSeconds: { type: "integer", description: "上次播放位置(秒)" },
      updatedAt: DATE_TIME,
    },
  },

  CosCredentials: {
    type: "object",
    description: "腾讯云 COS scoped STS 临时凭证(客户端直传用,文件字节不经后端)",
    required: ["userId", "secretId", "secretKey", "sessionToken", "bucket", "region", "keyPrefix"],
    properties: {
      userId: UUID,
      secretId: { type: "string", description: "临时 SecretId" },
      secretKey: { type: "string", description: "临时 SecretKey" },
      sessionToken: { type: "string", description: "STS session token" },
      startTime: { type: "integer", description: "生效时间(Unix 秒)" },
      expiredTime: { type: "integer", description: "失效时间(Unix 秒)" },
      bucket: { type: "string", description: "bucket 名(含 APPID 后缀)" },
      region: { type: "string" },
      keyPrefix: { type: "string", description: "对象 key 前缀(scope 为 <prefix>/<userId>/*)" },
      publicBaseUrl: { type: "string", description: "公网访问前缀,用于拼接最终 URL" },
    },
  },

  SystemSettingDTO: {
    type: "object",
    required: ["key", "value"],
    properties: {
      key: { type: "string" },
      value: { description: "任意 JSON 值(后端原样透传)" },
    },
  },
}
