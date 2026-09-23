import type { EndpointDoc } from "./types"

/**
 * 未在路由文件里写 JSDoc 的端点,在此补一份中文名称。
 *
 * 生成器优先使用路由文件里的 JSDoc 注释,只有「源码没写注释」的端点才回退到这里;
 * 因此**给路由补上 JSDoc 后,请顺手删掉这里的同名条目**(或直接补齐 `pnpm openapi:generate`
 * 生成的产物差异),避免两处描述不同步。
 */
export const operationSummaries: EndpointDoc[] = [
  // 活动
  { method: "post", path: "/api/activities", summary: "发布活动" },
  { method: "get", path: "/api/activities/[activityId]", summary: "活动详情" },

  // 认证
  { method: "post", path: "/api/auth/login/credentials", summary: "邮箱密码登录(Token 模式)" },
  { method: "post", path: "/api/auth/login/phone", summary: "手机验证码登录(Token 模式)" },
  { method: "post", path: "/api/auth/logout", summary: "退出登录" },
  { method: "get", path: "/api/auth/me", summary: "当前登录用户资料" },
  { method: "post", path: "/api/auth/sms/send", summary: "发送短信验证码" },
  {
    method: "post",
    path: "/api/auth/wechat-miniprogram/login",
    summary: "微信小程序登录(静默 / 手机号授权)",
  },

  // 圈子
  { method: "post", path: "/api/circles", summary: "创建圈子" },
  { method: "get", path: "/api/circles/followed", summary: "我关注的圈子" },
  { method: "get", path: "/api/circles/mine", summary: "我创建的圈子" },
  { method: "get", path: "/api/circles/[id]", summary: "圈子详情" },
  { method: "post", path: "/api/circles/[id]/contact", summary: "获取圈子创建者联系方式" },
  { method: "post", path: "/api/circles/[id]/follow", summary: "关注圈子" },

  // 招呼(联系请求)
  { method: "post", path: "/api/contact-requests", summary: "发起打招呼" },
  { method: "delete", path: "/api/contact-requests/[id]", summary: "撤回打招呼" },
  { method: "post", path: "/api/contact-requests/[id]/accept", summary: "接受打招呼" },
  { method: "post", path: "/api/contact-requests/[id]/reject", summary: "拒绝打招呼" },

  // 内容审核
  { method: "post", path: "/api/content/check", summary: "文本内容安全检测" },

  // 课程
  { method: "get", path: "/api/courses", summary: "课程列表" },
  { method: "get", path: "/api/courses/followed", summary: "我关注的课程" },
  { method: "get", path: "/api/courses/[courseId]", summary: "课程详情" },
  { method: "post", path: "/api/courses/[courseId]/follow", summary: "关注课程" },

  // 系统
  { method: "get", path: "/api/geo/reverse", summary: "逆地理编码(坐标转地址)" },
  { method: "get", path: "/api/settings", summary: "公开系统设置" },
  { method: "get", path: "/api/wechat/jssdk-config", summary: "微信 JS-SDK 签名配置" },

  // 兴趣标签
  { method: "get", path: "/api/hobby-tags/categories", summary: "兴趣分类树" },
  { method: "post", path: "/api/hobby-tags/custom", summary: "创建自定义标签" },
  { method: "get", path: "/api/hobby-tags/search", summary: "搜索兴趣标签" },
  { method: "get", path: "/api/interests/hot", summary: "热门兴趣榜" },

  // 位置匹配
  { method: "get", path: "/api/locations/match-circles", summary: "同趣的圈子" },
  { method: "get", path: "/api/locations/match-people", summary: "同趣的人" },

  // MBTI
  { method: "get", path: "/api/mbti/questions", summary: "MBTI 题目列表" },
  { method: "get", path: "/api/mbti/records", summary: "我的 MBTI 历史" },
  { method: "get", path: "/api/mbti/records/[id]", summary: "MBTI 历史详情" },
  { method: "post", path: "/api/mbti/submit", summary: "提交 MBTI 测试" },
  { method: "get", path: "/api/mbti/types", summary: "MBTI 类型列表" },
  { method: "get", path: "/api/mbti/types/[code]", summary: "MBTI 类型详情" },

  // 通知
  { method: "get", path: "/api/notifications", summary: "通知列表" },
  { method: "post", path: "/api/notifications/read-all", summary: "通知全部标记已读" },
  { method: "get", path: "/api/notifications/unread-count", summary: "未读通知数" },
  { method: "patch", path: "/api/notifications/[id]", summary: "标记通知已读" },

  // 教师认证
  { method: "post", path: "/api/teacher-applications", summary: "提交教师认证申请" },

  // 上传
  { method: "get", path: "/api/upload/cos-credentials", summary: "获取 COS 直传凭证" },

  // 用户
  { method: "get", path: "/api/users", summary: "用户列表(管理员)" },
  { method: "post", path: "/api/users", summary: "创建用户(管理员)" },
  { method: "get", path: "/api/users/followed", summary: "我关注的用户" },
  { method: "get", path: "/api/users/me/course-progress", summary: "课程学习进度" },
  {
    method: "put",
    path: "/api/users/me/course-progress/[lessonId]",
    summary: "保存课时播放进度",
  },
  { method: "get", path: "/api/users/me/courses/recent", summary: "最近学习" },
  { method: "put", path: "/api/users/me/hobby-tags", summary: "更新我的兴趣标签" },
  { method: "post", path: "/api/users/me/phone/verify", summary: "换绑手机号" },
  { method: "put", path: "/api/users/me/privacy", summary: "更新隐私设置" },
  { method: "patch", path: "/api/users/me/profile", summary: "更新个人资料" },
  { method: "get", path: "/api/users/[id]", summary: "用户详情(管理员)" },
  { method: "patch", path: "/api/users/[id]", summary: "更新用户(管理员)" },
  { method: "delete", path: "/api/users/[id]", summary: "删除用户(管理员)" },
  { method: "post", path: "/api/users/[id]/contact", summary: "获取用户联系方式" },
  { method: "post", path: "/api/users/[id]/follow", summary: "关注用户" },
  { method: "get", path: "/api/users/[id]/profile", summary: "用户公开主页" },

  // 管理后台(其余端点已在路由 JSDoc 中描述,这里只补缺失项)
  { method: "patch", path: "/api/admin/mbti/questions/[id]", summary: "更新 MBTI 题目" },
]
