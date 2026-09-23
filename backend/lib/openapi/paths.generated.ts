/**
 * 本文件由 `pnpm openapi:generate` 自动生成,请勿手工编辑。
 *
 * 内容来源:`app/api` 下各 `route.ts` 的导出方法 + JSDoc 注释,
 * 以及 `lib/openapi/manual.ts` 中手工登记的端点补充信息。
 * 新增 / 修改路由后请重新执行 `pnpm openapi:generate`(测试会校验同步)。
 */

import type { OpenApiPaths } from "./types"

/** 生成时后端 package.json 的版本号 */
export const apiVersion = "0.1.0"

/** 全部接口路径(95 个路径) */
export const openApiPaths: OpenApiPaths = {
  "/api/activities": {
    "get": {
      "tags": [
        "活动"
      ],
      "summary": "活动列表(分页,按起始时间倒序)",
      "description": "- 非创建者:仅见全局 active 活动。\n- 创建者:`?mine=1` 时只看自己发布的(含 cancelled)。\n- `?creatorId=<id>`:查看指定发布者的活动(仅 active),供公开主页展示「TA 发布的活动」;\n  与 mine=1 同时出现时以 creatorId 为准(对外口径只暴露 active)",
      "operationId": "getApiActivities",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "mine",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "creatorId",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "post": {
      "tags": [
        "活动"
      ],
      "summary": "发布活动",
      "operationId": "postApiActivities",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/activities/{activityId}": {
    "get": {
      "tags": [
        "活动"
      ],
      "summary": "活动详情",
      "operationId": "getApiActivitiesByActivityId",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "activityId",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "patch": {
      "tags": [
        "活动"
      ],
      "summary": "更新活动(仅发布者)",
      "operationId": "patchApiActivitiesByActivityId",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "activityId",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "delete": {
      "tags": [
        "活动"
      ],
      "summary": "软取消(置 status=cancelled),非硬删",
      "operationId": "deleteApiActivitiesByActivityId",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "activityId",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/admin/categories": {
    "get": {
      "tags": [
        "管理后台"
      ],
      "summary": "GET /api/admin/categories —— 管理员读取两级分类树",
      "operationId": "getApiAdminCategories",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    },
    "post": {
      "tags": [
        "管理后台"
      ],
      "summary": "POST /api/admin/categories —— 新建分类（一级大类或二级中类）",
      "operationId": "postApiAdminCategories",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/categories/{id}": {
    "patch": {
      "tags": [
        "管理后台"
      ],
      "summary": "编辑分类：名称 / slug / 排序 / 重新挂父类（支持一级↔二级互转）",
      "operationId": "patchApiAdminCategoriesById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    },
    "delete": {
      "tags": [
        "管理后台"
      ],
      "summary": "删除分类：有子分类 / 仍有标签引用时拒绝",
      "operationId": "deleteApiAdminCategoriesById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/checkins": {
    "get": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理员查询打卡列表（分页，按 createdAt 倒序）",
      "description": "- 鉴权：NextAuth cookie 会话 + ADMIN 角色（`requireAdmin`），\n  与 C 端 `/api/checkins/*`（Bearer token）是两套独立入口；\n- 与 C 端列表不同，此处**包含软删记录**（管理员需要看到并恢复）；\n- 查询参数：page / pageSize / status=active|deleted / q=关键词（正文或作者昵称）。",
      "operationId": "getApiAdminCheckins",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "status",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "q",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/checkins/{id}": {
    "patch": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理员下架（status → deleted）或恢复（status → active）打卡",
      "description": "- 未登录 401；非管理员 403；id 非法 400；打卡不存在 404；\n- 幂等：目标状态与当前一致时跳过写库，仍返回 200 + 最新 DTO；\n- 与本表软删字段同源（C 端作者删除同样写 `deleted`），管理端可反向恢复。",
      "operationId": "patchApiAdminCheckinsById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/circles": {
    "get": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理后台圈子列表(需 ADMIN 权限)",
      "description": "支持按 status / creator 筛选 + 分页。\n默认按 createdAt 倒序(最新创建的在前)。\nLEFT JOIN teacher_applications 返回认证材料供审核展示。\n\n响应:`Paginated<AdminCircleListItem>`",
      "operationId": "getApiAdminCircles",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "status",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "creator",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/circles/{id}": {
    "patch": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理员更新圈子状态(审核通过 / 驳回 / 下线 / 标记违规 / 恢复上线)",
      "description": "审核联动逻辑:\n- pending → active:若存在关联的 pending 状态 teacher_application,则升级用户为 TEACHER 并标记申请已通过\n- → rejected:同步驳回关联的 teacher_application(若存在)\n\n响应:`CircleDTO`(更新后的圈子)",
      "operationId": "patchApiAdminCirclesById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/courses/{id}": {
    "patch": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理员审核 / 上下线课程",
      "description": "- `pending → active`:通过(写 reviewerId / reviewedAt);\n- `→ rejected`:驳回(写 reviewerId / reviewedAt / reviewNote);\n- `active ⇄ offline`:下线 / 恢复上线。\n\n`reviewerId` / `reviewedAt` 对每次管理员操作都写入(审计字段)。\n\n不发审核结果通知:通知的 admin 铃铛只服务 ADMIN,教师读不到,\n且小程序端本期没有课程页(见设计文档 §3 决策 7)。",
      "operationId": "patchApiAdminCoursesById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/hobby-tags": {
    "get": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理后台标签列表(需 ADMIN 权限)",
      "description": "支持按 status / category 筛选 + q 关键词搜索 + 分页。\n默认按 createdAt 倒序(最新创建的在前,便于审核新提交的标签)。\n\n响应:`Paginated<TagDTO>`",
      "operationId": "getApiAdminHobbyTags",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "status",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "category",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "q",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    },
    "post": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理后台新建标签",
      "description": "pinyin / pinyinInitials 由名称自动生成,status 默认 pending。",
      "operationId": "postApiAdminHobbyTags",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/hobby-tags/{id}": {
    "patch": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理员更新标签(审核状态 / 重新归类)",
      "description": "响应:`TagDTO`(更新后的标签)",
      "operationId": "patchApiAdminHobbyTagsById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    },
    "delete": {
      "tags": [
        "管理后台"
      ],
      "summary": "删除标签（物理删除）",
      "description": "不受外键约束,因此直接删除即可。",
      "operationId": "deleteApiAdminHobbyTagsById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/mbti/hobby-tags": {
    "get": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理后台标签库检索(供推荐概率矩阵选择标签),复用 searchTags 多策略搜索",
      "description": "(仅返回 status='approved' 的标签)。\n注意:q 为空时 searchTags 直接返回空列表,前端需自行判断是否发起请求。",
      "operationId": "getApiAdminMbtiHobbyTags",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "q",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "limit",
          "in": "query",
          "required": false,
          "schema": {
            "type": "integer"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/mbti/questions": {
    "get": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理后台题目列表(含停用题目,按 sortOrder 升序)",
      "operationId": "getApiAdminMbtiQuestions",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    },
    "post": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理后台新增题目",
      "operationId": "postApiAdminMbtiQuestions",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/mbti/questions/{id}": {
    "patch": {
      "tags": [
        "管理后台"
      ],
      "summary": "更新 MBTI 题目",
      "operationId": "patchApiAdminMbtiQuestionsById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    },
    "delete": {
      "tags": [
        "管理后台"
      ],
      "summary": "删除题目(物理删除;seed 重跑可恢复种子题)",
      "operationId": "deleteApiAdminMbtiQuestionsById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/mbti/scores": {
    "get": {
      "tags": [
        "管理后台"
      ],
      "summary": "概率矩阵查询(双视角)",
      "description": "- `?tagId=`   单标签的 16 型概率向量\n- `?typeCode=` 单类型下全部兴趣按概率倒序\n两个参数必须二选一。",
      "operationId": "getApiAdminMbtiScores",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "tagId",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "typeCode",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    },
    "post": {
      "tags": [
        "管理后台"
      ],
      "summary": "配置/更新一条「兴趣 × 类型」推荐概率(UNIQUE(hobbyTagId, typeCode) upsert)",
      "description": "校验:标签必须存在于 hobby_tags,概率 ∈ [0,100]。",
      "operationId": "postApiAdminMbtiScores",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/mbti/scores/{id}": {
    "patch": {
      "tags": [
        "管理后台"
      ],
      "summary": "调整某条「兴趣 × 类型」推荐概率/解释/启停",
      "operationId": "patchApiAdminMbtiScoresById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    },
    "delete": {
      "tags": [
        "管理后台"
      ],
      "summary": "删除某条推荐概率记录(该组合恢复为概率 0)",
      "operationId": "deleteApiAdminMbtiScoresById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/mbti/types/{code}": {
    "patch": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理后台编辑人格类型展示文案(名称/别称/描述/优劣势)",
      "operationId": "patchApiAdminMbtiTypesByCode",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "code",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/notifications": {
    "get": {
      "tags": [
        "管理后台"
      ],
      "summary": "后台管理员的后台通知列表(分页,按时间倒序)",
      "description": "仅返回 `linkTarget = 'admin'` 的通知(由 notifyAdmins 写入),与小程序端互不串扰。\n支持查询参数:page / pageSize / unreadOnly(=true 仅未读)。",
      "operationId": "getApiAdminNotifications",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "unreadOnly",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/notifications/read-all": {
    "post": {
      "tags": [
        "管理后台"
      ],
      "summary": "将当前管理员后台(`linkTarget = 'admin'`)全部未读通知标记为已读",
      "description": "限定 linkTarget 避免误清小程序端通知。",
      "operationId": "postApiAdminNotificationsReadAll",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/notifications/unread-count": {
    "get": {
      "tags": [
        "管理后台"
      ],
      "summary": "当前管理员的后台未读通知数量(仅 `linkTarget = 'admin'`)",
      "description": "用于后台铃铛未读角标展示。",
      "operationId": "getApiAdminNotificationsUnreadCount",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/notifications/{id}": {
    "patch": {
      "tags": [
        "管理后台"
      ],
      "summary": "标记单条后台通知为已读",
      "description": "幂等:已读 / 不存在 / 非本人均返回 `marked:false`(200),不报错。",
      "operationId": "patchApiAdminNotificationsById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/settings": {
    "patch": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理员更新(或新增)系统设置项,upsert 语义",
      "description": "例如 isAppDeploying / contentModerationEnabled:管理员切换后,\n小程序端在下次拉取 /api/settings 时生效。\n\n响应:`SystemSettingDTO`(更新后的设置项)",
      "operationId": "patchApiAdminSettings",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/stats": {
    "get": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理后台仪表盘统计数据(需 ADMIN 权限)",
      "description": "返回 5 项核心指标,供首页 StatCard 展示。\n\n响应:`AdminStats`",
      "operationId": "getApiAdminStats",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/teacher-applications": {
    "get": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理员查询教师认证申请列表(分页,按 createdAt 倒序)",
      "description": "可选 status 筛选:?status=pending|approved|rejected",
      "operationId": "getApiAdminTeacherApplications",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "status",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/admin/teacher-applications/{id}": {
    "patch": {
      "tags": [
        "管理后台"
      ],
      "summary": "管理员审批教师认证申请",
      "description": "- approved:升级用户为 TEACHER,标记申请已通过\n- rejected:标记申请已驳回,记录驳回原因",
      "operationId": "patchApiAdminTeacherApplicationsById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/auth/login/credentials": {
    "post": {
      "tags": [
        "认证"
      ],
      "summary": "邮箱密码登录(Token 模式)",
      "operationId": "postApiAuthLoginCredentials",
      "responses": {
        "200": {
          "description": "登录成功",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "$ref": "#/components/schemas/AuthLoginResponse"
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        },
        "401": {
          "description": "邮箱或密码错误"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "email",
                "password"
              ],
              "properties": {
                "email": {
                  "type": "string",
                  "format": "email"
                },
                "password": {
                  "type": "string",
                  "format": "password"
                }
              }
            }
          }
        }
      }
    }
  },
  "/api/auth/login/phone": {
    "post": {
      "tags": [
        "认证"
      ],
      "summary": "手机验证码登录(Token 模式)",
      "operationId": "postApiAuthLoginPhone",
      "responses": {
        "200": {
          "description": "登录成功",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "$ref": "#/components/schemas/AuthLoginResponse"
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        },
        "401": {
          "description": "手机号或验证码错误"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "phone",
                "code"
              ],
              "properties": {
                "phone": {
                  "type": "string"
                },
                "code": {
                  "type": "string",
                  "description": "6 位短信验证码"
                }
              }
            }
          }
        }
      }
    }
  },
  "/api/auth/logout": {
    "post": {
      "tags": [
        "认证"
      ],
      "summary": "退出登录",
      "operationId": "postApiAuthLogout",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      }
    }
  },
  "/api/auth/me": {
    "get": {
      "tags": [
        "认证"
      ],
      "summary": "当前登录用户资料",
      "operationId": "getApiAuthMe",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "$ref": "#/components/schemas/UserProfileDTO"
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "patch": {
      "tags": [
        "认证"
      ],
      "summary": "更新当前登录用户自己的资料(昵称 / 邮箱 / 头像 URL)",
      "description": "鉴权复用 `readUserFromToken`(与 GET 一致,不依赖 NextAuth session 缓存)。\n邮箱修改会校验全局唯一性;头像空串归一为 null(数据库列可空)。",
      "operationId": "patchApiAuthMe",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/auth/sms/send": {
    "post": {
      "tags": [
        "认证"
      ],
      "summary": "发送短信验证码",
      "operationId": "postApiAuthSmsSend",
      "responses": {
        "201": {
          "description": "验证码已发送(不泄露手机号是否已注册)",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "type": "null"
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        },
        "400": {
          "description": "手机号格式不正确"
        },
        "429": {
          "description": "触发限流(60s 冷却 / 小时配额)"
        },
        "502": {
          "description": "短信服务商失败"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "phone"
              ],
              "properties": {
                "phone": {
                  "type": "string",
                  "example": "13800138000",
                  "description": "中国大陆手机号"
                }
              }
            }
          }
        }
      }
    }
  },
  "/api/auth/wechat-miniprogram/login": {
    "post": {
      "tags": [
        "认证"
      ],
      "summary": "微信小程序登录(静默 / 手机号授权)",
      "operationId": "postApiAuthWechatMiniprogramLogin",
      "responses": {
        "200": {
          "description": "登录成功",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "$ref": "#/components/schemas/AuthLoginResponse"
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        },
        "400": {
          "description": "参数缺失 / 微信侧错误 / 该微信未绑定账号"
        },
        "401": {
          "description": "登录失败"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "code"
              ],
              "properties": {
                "code": {
                  "type": "string",
                  "description": "wx.login() 返回的 js_code"
                },
                "phoneCode": {
                  "type": "string",
                  "description": "getPhoneNumber 按钮返回的 phone_code;不传则为静默登录(要求已绑定)"
                }
              }
            }
          }
        }
      }
    }
  },
  "/api/checkins": {
    "post": {
      "tags": [
        "打卡"
      ],
      "summary": "发布一条打卡",
      "description": "- 鉴权:任意登录用户;\n- `circleId` 可选,但必须是「当前用户关注的 active 圈子」(需求:打卡到自己关注的圈子);\n- `tags` 为兴趣标签名称,校验其在 hobby_tags 中存在且 approved(与保存兴趣标签同口径);\n- 媒体最多 9 张图片或 1 个视频,互斥;\n- 返回 `IResponse<CheckinDTO>`(201)。",
      "operationId": "postApiCheckins",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "description": "content / images / videoUrl 至少一项;视频与图片不能同时存在",
              "properties": {
                "content": {
                  "type": "string",
                  "description": "正文(可空,允许纯媒体打卡)"
                },
                "circleId": {
                  "type": "string",
                  "format": "uuid"
                },
                "tags": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "images": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "图片 URL,最多 9 张"
                },
                "videoUrl": {
                  "type": "string",
                  "description": "视频 URL,与 images 互斥"
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/checkins/mine": {
    "get": {
      "tags": [
        "打卡"
      ],
      "summary": "我的打卡:当前用户发布过的全部 active 打卡(含纯文字),按发布时间倒序分页",
      "description": "注意:静态段 `mine` 优先于动态段 `[id]`(与 /api/circles/mine 同理)。",
      "operationId": "getApiCheckinsMine",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/checkins/plaza": {
    "get": {
      "tags": [
        "打卡"
      ],
      "summary": "打卡广场:仅返回「含图片或视频」的 active 打卡,按发布时间倒序分页",
      "description": "纯文字打卡不进入广场(需求第 4 条)。\n\n鉴权(可选):游客可预览**第一页**,翻页(page > 1)必须登录,\n未登录翻页返回 401。该规则在服务端强制,前端只是提前引导登录。\n\n注意:静态段 `plaza` 优先于动态段 `[id]`,不会被 DELETE /api/checkins/:id 捕获。",
      "operationId": "getApiCheckinsPlaza",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/checkins/{id}": {
    "get": {
      "tags": [
        "打卡"
      ],
      "summary": "打卡详情(分享落地页/从列表点入)",
      "description": "- 未登录 401;id 非法 400;\n- 已软删除的打卡对外等同于「不存在」,统一返回 404,不泄漏历史数据。",
      "operationId": "getApiCheckinsById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "delete": {
      "tags": [
        "打卡"
      ],
      "summary": "作者软删除自己的打卡(status → `deleted`),删除后不再出现在广场 / 我的打卡 / 圈子打卡",
      "description": "- 未登录 401;id 非法 400;打卡不存在 404;非作者 403;\n- 幂等:已删除再删一次仍返回 200,不重复写库。",
      "operationId": "deleteApiCheckinsById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/circles": {
    "get": {
      "tags": [
        "圈子"
      ],
      "summary": "圈子列表(分页,按创建时间倒序)",
      "description": "- `?creatorId=<userId>`:返回该用户**已上线**(status=active)的圈子,\n  供公开主页展示「TA 发布的圈子」;pending / offline / violated / deleted 一律不外泄\n- 缺少 creatorId 返回 400(本接口不提供全站圈子流,避免无意义的全表扫描)",
      "operationId": "getApiCircles",
      "responses": {
        "200": {
          "description": "分页成功",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "type": "object",
                    "required": [
                      "list",
                      "total",
                      "page",
                      "pageSize"
                    ],
                    "properties": {
                      "list": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/CircleDTO"
                        }
                      },
                      "total": {
                        "type": "integer"
                      },
                      "page": {
                        "type": "integer"
                      },
                      "pageSize": {
                        "type": "integer"
                      }
                    }
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        }
      },
      "parameters": [
        {
          "name": "creatorId",
          "in": "query",
          "description": "发布者用户 id(必传)",
          "required": true,
          "schema": {
            "type": "string",
            "format": "uuid"
          }
        },
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "post": {
      "tags": [
        "圈子"
      ],
      "summary": "创建圈子",
      "operationId": "postApiCircles",
      "responses": {
        "201": {
          "description": "创建成功(待管理员审核)",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "type": "object",
                    "properties": {
                      "circleId": {
                        "type": "string",
                        "format": "uuid"
                      },
                      "status": {
                        "type": "string",
                        "example": "pending"
                      }
                    }
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        },
        "400": {
          "description": "参数错误 / 标签不存在或未通过审核"
        },
        "429": {
          "description": "24 小时内创建数量已达上限"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "title",
                "description",
                "tags",
                "latitude",
                "longitude",
                "address"
              ],
              "properties": {
                "title": {
                  "type": "string",
                  "description": "2-50 字"
                },
                "description": {
                  "type": "string",
                  "description": "10-1000 字"
                },
                "tags": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "1-N 个已审核通过的标签名"
                },
                "latitude": {
                  "type": "number"
                },
                "longitude": {
                  "type": "number"
                },
                "address": {
                  "type": "string"
                },
                "contactPhone": {
                  "type": "string",
                  "description": "与 wechat 至少填一项"
                },
                "wechat": {
                  "type": "string",
                  "description": "与 contactPhone 至少填一项"
                },
                "activityTime": {
                  "type": "string"
                },
                "maxMembers": {
                  "type": "integer"
                },
                "coverImages": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "最多 9 张"
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/circles/followed": {
    "get": {
      "tags": [
        "圈子"
      ],
      "summary": "我关注的圈子",
      "operationId": "getApiCirclesFollowed",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "userId",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/circles/mine": {
    "get": {
      "tags": [
        "圈子"
      ],
      "summary": "我创建的圈子",
      "operationId": "getApiCirclesMine",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/circles/{id}": {
    "get": {
      "tags": [
        "圈子"
      ],
      "summary": "圈子详情",
      "operationId": "getApiCirclesById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "put": {
      "tags": [
        "圈子"
      ],
      "summary": "更新圈子信息(仅创建者可调)",
      "operationId": "putApiCirclesById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "delete": {
      "tags": [
        "圈子"
      ],
      "summary": "软删除圈子(status='deleted'),仅创建者可调",
      "operationId": "deleteApiCirclesById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/circles/{id}/checkins": {
    "get": {
      "tags": [
        "圈子"
      ],
      "summary": "圈子打卡:该圈子下全部 active 打卡(含纯文字),按发布时间倒序分页",
      "description": "- 圈子不存在或已删除返回 404(避免对无效 id 返回空列表造成误导);\n- 圈子被下线 / 违规时仍可查看历史打卡(仅 `deleted` 视为不存在)。",
      "operationId": "getApiCirclesByIdCheckins",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/circles/{id}/contact": {
    "post": {
      "tags": [
        "圈子"
      ],
      "summary": "获取圈子创建者联系方式",
      "operationId": "postApiCirclesByIdContact",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/circles/{id}/follow": {
    "post": {
      "tags": [
        "圈子"
      ],
      "summary": "关注圈子",
      "operationId": "postApiCirclesByIdFollow",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "delete": {
      "tags": [
        "圈子"
      ],
      "summary": "取消关注(幂等)",
      "operationId": "deleteApiCirclesByIdFollow",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/contact-requests": {
    "get": {
      "tags": [
        "招呼"
      ],
      "summary": "列出当前用户的联系请求(分页,按创建时间倒序)",
      "description": "- `direction`: incoming(我收到的,默认) / outgoing(我发出的)\n- `status`: pending / accepted / rejected / all(默认)",
      "operationId": "getApiContactRequests",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "direction",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "status",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "post": {
      "tags": [
        "招呼"
      ],
      "summary": "发起打招呼",
      "operationId": "postApiContactRequests",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "toUserId"
              ],
              "properties": {
                "toUserId": {
                  "type": "string",
                  "format": "uuid"
                },
                "message": {
                  "type": "string",
                  "description": "留言(≤100 字,可空)"
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/contact-requests/{id}": {
    "delete": {
      "tags": [
        "招呼"
      ],
      "summary": "撤回打招呼",
      "operationId": "deleteApiContactRequestsById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/contact-requests/{id}/accept": {
    "post": {
      "tags": [
        "招呼"
      ],
      "summary": "接受打招呼",
      "operationId": "postApiContactRequestsByIdAccept",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/contact-requests/{id}/reject": {
    "post": {
      "tags": [
        "招呼"
      ],
      "summary": "拒绝打招呼",
      "operationId": "postApiContactRequestsByIdReject",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/content/check": {
    "post": {
      "tags": [
        "内容审核"
      ],
      "summary": "文本内容安全检测",
      "operationId": "postApiContentCheck",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "$ref": "#/components/schemas/ContentCheckDTO"
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        },
        "503": {
          "description": "审核服务不可用(未绑定微信 / 微信侧异常,fail-closed)"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "type",
                "content"
              ],
              "properties": {
                "type": {
                  "type": "string",
                  "enum": [
                    "text"
                  ]
                },
                "content": {
                  "type": "string",
                  "description": "1-5000 字符"
                },
                "scene": {
                  "type": "string",
                  "enum": [
                    "circle",
                    "checkin",
                    "activity",
                    "comment",
                    "profile"
                  ]
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/courses": {
    "get": {
      "tags": [
        "课程"
      ],
      "summary": "课程列表",
      "operationId": "getApiCourses",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "creatorId",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "keyword",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "post": {
      "tags": [
        "课程"
      ],
      "summary": "用户端(uni-app)发布视频课程(任意登录用户可调,不区分角色)",
      "description": "- 401 未登录 / 400 校验失败 / 201 成功\n- 课程创建后 status 恒为 pending,管理员审核通过后上线\n- 与教师后台 `POST /api/teacher/courses` 共用 `lib/courses` 的\n  `createCourseSchema` + `createCourse`(课程与课时同一事务落库),\n  仅鉴权口径不同:C 端走 Bearer token 的 `requireSession`。",
      "operationId": "postApiCourses",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/courses/followed": {
    "get": {
      "tags": [
        "课程"
      ],
      "summary": "我关注的课程",
      "operationId": "getApiCoursesFollowed",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "userId",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/courses/{courseId}": {
    "get": {
      "tags": [
        "课程"
      ],
      "summary": "课程详情",
      "operationId": "getApiCoursesByCourseId",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "courseId",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/courses/{courseId}/follow": {
    "post": {
      "tags": [
        "课程"
      ],
      "summary": "关注课程",
      "operationId": "postApiCoursesByCourseIdFollow",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "courseId",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "delete": {
      "tags": [
        "课程"
      ],
      "summary": "取消关注(幂等)",
      "operationId": "deleteApiCoursesByCourseIdFollow",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "courseId",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/geo/reverse": {
    "get": {
      "tags": [
        "系统"
      ],
      "summary": "逆地理编码(坐标转地址)",
      "operationId": "getApiGeoReverse",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      },
      "parameters": [
        {
          "name": "latitude",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "longitude",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ]
    }
  },
  "/api/hobby-tags/categories": {
    "get": {
      "tags": [
        "兴趣标签"
      ],
      "summary": "兴趣分类树",
      "operationId": "getApiHobbyTagsCategories",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      }
    }
  },
  "/api/hobby-tags/custom": {
    "post": {
      "tags": [
        "兴趣标签"
      ],
      "summary": "创建自定义标签",
      "operationId": "postApiHobbyTagsCustom",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "name"
              ],
              "properties": {
                "name": {
                  "type": "string",
                  "description": "1-30 字符"
                },
                "category": {
                  "type": "string",
                  "description": "一级大类名(可选)"
                },
                "subCategory": {
                  "type": "string",
                  "description": "二级中类名(可选)"
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/hobby-tags/search": {
    "get": {
      "tags": [
        "兴趣标签"
      ],
      "summary": "搜索兴趣标签",
      "operationId": "getApiHobbyTagsSearch",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "q",
          "in": "query",
          "description": "关键词(空则返回热门 top 10)",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "limit",
          "in": "query",
          "description": "返回条数上限(最大 50)",
          "required": false,
          "schema": {
            "type": "integer",
            "default": 10
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/interests/hot": {
    "get": {
      "tags": [
        "兴趣热点"
      ],
      "summary": "热门兴趣榜",
      "operationId": "getApiInterestsHot",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      },
      "parameters": [
        {
          "name": "days",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "startDate",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "endDate",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "limit",
          "in": "query",
          "required": false,
          "schema": {
            "type": "integer"
          }
        }
      ]
    }
  },
  "/api/locations/match-circles": {
    "get": {
      "tags": [
        "位置匹配"
      ],
      "summary": "同趣的圈子",
      "operationId": "getApiLocationsMatchCircles",
      "responses": {
        "200": {
          "description": "分页成功",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "type": "object",
                    "required": [
                      "list",
                      "total",
                      "page",
                      "pageSize"
                    ],
                    "properties": {
                      "list": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/MatchCircleDTO"
                        }
                      },
                      "total": {
                        "type": "integer"
                      },
                      "page": {
                        "type": "integer"
                      },
                      "pageSize": {
                        "type": "integer"
                      }
                    }
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        }
      },
      "parameters": [
        {
          "name": "latitude",
          "in": "query",
          "description": "当前纬度",
          "required": true,
          "schema": {
            "type": "number"
          }
        },
        {
          "name": "longitude",
          "in": "query",
          "description": "当前经度",
          "required": true,
          "schema": {
            "type": "number"
          }
        },
        {
          "name": "tags",
          "in": "query",
          "description": "兴趣标签名(逗号分隔)",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "rangeKm",
          "in": "query",
          "description": "搜索半径(km)",
          "required": false,
          "schema": {
            "type": "number"
          }
        },
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        }
      ]
    }
  },
  "/api/locations/match-people": {
    "get": {
      "tags": [
        "位置匹配"
      ],
      "summary": "同趣的人",
      "operationId": "getApiLocationsMatchPeople",
      "responses": {
        "200": {
          "description": "分页成功",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "type": "object",
                    "required": [
                      "list",
                      "total",
                      "page",
                      "pageSize"
                    ],
                    "properties": {
                      "list": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/MatchPersonDTO"
                        }
                      },
                      "total": {
                        "type": "integer"
                      },
                      "page": {
                        "type": "integer"
                      },
                      "pageSize": {
                        "type": "integer"
                      }
                    }
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        }
      },
      "parameters": [
        {
          "name": "latitude",
          "in": "query",
          "description": "当前纬度",
          "required": true,
          "schema": {
            "type": "number"
          }
        },
        {
          "name": "longitude",
          "in": "query",
          "description": "当前经度",
          "required": true,
          "schema": {
            "type": "number"
          }
        },
        {
          "name": "tags",
          "in": "query",
          "description": "兴趣标签名(逗号分隔)",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "rangeKm",
          "in": "query",
          "description": "搜索半径(km)",
          "required": false,
          "schema": {
            "type": "number"
          }
        },
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/mbti/questions": {
    "get": {
      "tags": [
        "MBTI"
      ],
      "summary": "MBTI 题目列表",
      "operationId": "getApiMbtiQuestions",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      }
    }
  },
  "/api/mbti/records": {
    "get": {
      "tags": [
        "MBTI"
      ],
      "summary": "我的 MBTI 历史",
      "operationId": "getApiMbtiRecords",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/mbti/records/{id}": {
    "get": {
      "tags": [
        "MBTI"
      ],
      "summary": "MBTI 历史详情",
      "operationId": "getApiMbtiRecordsById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/mbti/submit": {
    "post": {
      "tags": [
        "MBTI"
      ],
      "summary": "提交 MBTI 测试",
      "operationId": "postApiMbtiSubmit",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "$ref": "#/components/schemas/MbtiSubmitResultDTO"
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "answers"
              ],
              "properties": {
                "answers": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "enum": [
                      "A",
                      "B"
                    ]
                  }
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/mbti/types": {
    "get": {
      "tags": [
        "MBTI"
      ],
      "summary": "MBTI 类型列表",
      "operationId": "getApiMbtiTypes",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      }
    }
  },
  "/api/mbti/types/{code}": {
    "get": {
      "tags": [
        "MBTI"
      ],
      "summary": "MBTI 类型详情",
      "operationId": "getApiMbtiTypesByCode",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      },
      "parameters": [
        {
          "name": "code",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ]
    }
  },
  "/api/notifications": {
    "get": {
      "tags": [
        "通知"
      ],
      "summary": "通知列表",
      "operationId": "getApiNotifications",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "unreadOnly",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/notifications/read-all": {
    "post": {
      "tags": [
        "通知"
      ],
      "summary": "通知全部标记已读",
      "operationId": "postApiNotificationsReadAll",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/notifications/unread-count": {
    "get": {
      "tags": [
        "通知"
      ],
      "summary": "未读通知数",
      "operationId": "getApiNotificationsUnreadCount",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/notifications/{id}": {
    "patch": {
      "tags": [
        "通知"
      ],
      "summary": "标记通知已读",
      "operationId": "patchApiNotificationsById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/openapi": {
    "get": {
      "tags": [
        "系统"
      ],
      "summary": "返回 OpenAPI 3.0 文档(JSON)",
      "description": "- 公开只读:内容仅为接口契约(路径 / 参数 / 响应结构),不含任何业务数据;\n- 浏览器直接打开即可查看;可导入 Postman / Apifox / IDE 的 OpenAPI 插件;\n- 同名 Swagger UI 页面在管理后台 `/admin/api-docs`(需登录)。",
      "operationId": "getApiOpenapi",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      }
    }
  },
  "/api/settings": {
    "get": {
      "tags": [
        "系统"
      ],
      "summary": "公开系统设置",
      "operationId": "getApiSettings",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      }
    }
  },
  "/api/teacher-applications": {
    "post": {
      "tags": [
        "教师认证"
      ],
      "summary": "提交教师认证申请",
      "operationId": "postApiTeacherApplications",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/teacher-applications/mine": {
    "get": {
      "tags": [
        "教师认证"
      ],
      "summary": "查询当前用户最新的教师认证申请记录",
      "description": "- 返回最近一条 teacher_application 或 null",
      "operationId": "getApiTeacherApplicationsMine",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/teacher/activities": {
    "post": {
      "tags": [
        "教师后台"
      ],
      "summary": "教师在后台发布活动",
      "description": "的 `createActivity`,差别只在鉴权方式:本路由走 NextAuth cookie session,\n角色门槛 `TEACHER | ADMIN`(见 `requireTeacher`)。",
      "operationId": "postApiTeacherActivities",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要教师或管理员权限"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "title",
                "description",
                "startTime",
                "registrationDeadline"
              ],
              "properties": {
                "title": {
                  "type": "string",
                  "description": "1-100 字"
                },
                "description": {
                  "type": "string"
                },
                "startTime": {
                  "type": "string",
                  "format": "date-time",
                  "description": "ISO 8601"
                },
                "registrationDeadline": {
                  "type": "string",
                  "format": "date-time",
                  "description": "须早于 startTime"
                },
                "contactPhone": {
                  "type": "string"
                },
                "coverImages": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "最多 9 张"
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/teacher/activities/{activityId}": {
    "patch": {
      "tags": [
        "教师后台"
      ],
      "summary": "老师编辑自己的活动(部分更新)",
      "operationId": "patchApiTeacherActivitiesByActivityId",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      },
      "parameters": [
        {
          "name": "activityId",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ]
    },
    "delete": {
      "tags": [
        "教师后台"
      ],
      "summary": "软取消活动(置 `status=cancelled`,非硬删)",
      "operationId": "deleteApiTeacherActivitiesByActivityId",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      },
      "parameters": [
        {
          "name": "activityId",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ]
    }
  },
  "/api/teacher/circles": {
    "post": {
      "tags": [
        "教师后台"
      ],
      "summary": "教师在后台创建圈子",
      "description": "`createCircle`(24h 配额 / 标签白名单 / 落库 / 通知 / 兴趣事件),\n差别只在鉴权方式:本路由走 NextAuth cookie session,角色门槛\n`TEACHER | ADMIN`(见 `requireTeacher`)。\n\n返回 201 + `{ circleId, status: \"pending\" }`;等管理员审核通过后上线。",
      "operationId": "postApiTeacherCircles",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要教师或管理员权限"
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/teacher/circles/{circleId}": {
    "patch": {
      "tags": [
        "教师后台"
      ],
      "summary": "老师编辑自己的圈子(字段更新 + 自主上下线)",
      "description": "权限:\n- 登录角色需为 TEACHER / ADMIN(`requireTeacher`)\n- 圈子创建者本人;或 ADMIN(代管)\n\n状态机(防止绕过管理员审核):\n- 仅允许 `active ↔ offline`\n- 当前状态为 `pending` / `rejected` / `violated` / `deleted` 时,任何 status 变更一律 403",
      "operationId": "patchApiTeacherCirclesByCircleId",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要教师或管理员权限"
        }
      },
      "parameters": [
        {
          "name": "circleId",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/teacher/courses": {
    "post": {
      "tags": [
        "教师后台"
      ],
      "summary": "教师在后台创建视频课程(status 恒为 pending,需管理员审核)",
      "description": "课程与课时在同一事务内写入,任一失败整体回滚(见 lib/courses.createCourse)。",
      "operationId": "postApiTeacherCourses",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要教师或管理员权限"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "title",
                "description",
                "lessons"
              ],
              "properties": {
                "title": {
                  "type": "string",
                  "description": "2 字以上"
                },
                "description": {
                  "type": "string"
                },
                "coverImages": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "最多 9 张"
                },
                "tags": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "lessons": {
                  "type": "array",
                  "description": "课时列表(按提交顺序)",
                  "items": {
                    "type": "object",
                    "properties": {
                      "title": {
                        "type": "string"
                      },
                      "description": {
                        "type": "string"
                      },
                      "videoUrl": {
                        "type": "string"
                      },
                      "durationSeconds": {
                        "type": "integer"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/teacher/courses/{courseId}": {
    "patch": {
      "tags": [
        "教师后台"
      ],
      "summary": "教师编辑自己的课程(部分更新)",
      "description": "- `lessons` 提供时全量替换(事务内删旧插新,顺序按数组下标);\n- `status` 仅允许 `active | offline`,且课程当前必须是 `active` / `offline` ——\n  教师不能自行把 `pending` 变 `active`(绕过审核),也不能把 `rejected` 变 `active`。",
      "operationId": "patchApiTeacherCoursesByCourseId",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      },
      "parameters": [
        {
          "name": "courseId",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ]
    },
    "delete": {
      "tags": [
        "教师后台"
      ],
      "summary": "软删除课程(置 `status=deleted`,终态,非硬删)",
      "operationId": "deleteApiTeacherCoursesByCourseId",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      },
      "parameters": [
        {
          "name": "courseId",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ]
    }
  },
  "/api/upload/cos-credentials": {
    "get": {
      "tags": [
        "文件上传"
      ],
      "summary": "获取 COS 直传凭证",
      "operationId": "getApiUploadCosCredentials",
      "responses": {
        "200": {
          "description": "STS 临时凭证",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "$ref": "#/components/schemas/CosCredentials"
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/users": {
    "get": {
      "tags": [
        "用户"
      ],
      "summary": "用户列表(管理员)",
      "operationId": "getApiUsers",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "q",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        },
        {
          "name": "role",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    },
    "post": {
      "tags": [
        "用户"
      ],
      "summary": "创建用户(管理员)",
      "operationId": "postApiUsers",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/users/followed": {
    "get": {
      "tags": [
        "用户"
      ],
      "summary": "我关注的用户",
      "operationId": "getApiUsersFollowed",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "required": false,
          "description": "页码(从 1 开始,默认 1)",
          "schema": {
            "type": "integer",
            "default": 1,
            "minimum": 1
          }
        },
        {
          "name": "pageSize",
          "in": "query",
          "required": false,
          "description": "每页条数(默认 20,上限 100)",
          "schema": {
            "type": "integer",
            "default": 20,
            "minimum": 1,
            "maximum": 100
          }
        },
        {
          "name": "userId",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/users/me/course-progress": {
    "get": {
      "tags": [
        "用户"
      ],
      "summary": "课程学习进度",
      "operationId": "getApiUsersMeCourseProgress",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "courseId",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/users/me/course-progress/{lessonId}": {
    "put": {
      "tags": [
        "用户"
      ],
      "summary": "保存课时播放进度",
      "operationId": "putApiUsersMeCourseProgressByLessonId",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "lessonId",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/users/me/courses/recent": {
    "get": {
      "tags": [
        "用户"
      ],
      "summary": "最近学习",
      "operationId": "getApiUsersMeCoursesRecent",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "limit",
          "in": "query",
          "required": false,
          "schema": {
            "type": "integer"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/users/me/hobby-tags": {
    "put": {
      "tags": [
        "用户"
      ],
      "summary": "更新我的兴趣标签",
      "operationId": "putApiUsersMeHobbyTags",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "tags"
              ],
              "properties": {
                "tags": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "1-10 个标签名(全量替换)"
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/users/me/phone/verify": {
    "post": {
      "tags": [
        "用户"
      ],
      "summary": "换绑手机号",
      "operationId": "postApiUsersMePhoneVerify",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "requestBody": {
        "description": "换绑手机号",
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "phone",
                "code"
              ],
              "properties": {
                "phone": {
                  "type": "string"
                },
                "code": {
                  "type": "string",
                  "description": "6 位短信验证码"
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/users/me/privacy": {
    "put": {
      "tags": [
        "用户"
      ],
      "summary": "更新隐私设置",
      "operationId": "putApiUsersMePrivacy",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/PrivacySettings"
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/users/me/profile": {
    "patch": {
      "tags": [
        "用户"
      ],
      "summary": "更新个人资料",
      "operationId": "patchApiUsersMeProfile",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "requestBody": {
        "required": false,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "description": "字段均可选,仅传需要更新的字段",
              "properties": {
                "name": {
                  "type": "string"
                },
                "role": {
                  "type": "string",
                  "enum": [
                    "USER",
                    "TEACHER"
                  ]
                },
                "phone": {
                  "type": "string"
                },
                "practiceYears": {
                  "type": "integer"
                },
                "activityLevel": {
                  "type": "string",
                  "enum": [
                    "low",
                    "medium",
                    "high"
                  ]
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/users/me/wechat": {
    "get": {
      "tags": [
        "用户"
      ],
      "summary": "GET /api/users/me/wechat —— 查询当前账号微信绑定状态",
      "operationId": "getApiUsersMeWechat",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "post": {
      "tags": [
        "用户"
      ],
      "summary": "POST /api/users/me/wechat —— 绑定微信（body: { code }）",
      "operationId": "postApiUsersMeWechat",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "delete": {
      "tags": [
        "用户"
      ],
      "summary": "DELETE /api/users/me/wechat —— 解绑微信（需保证账号仍有其它登录方式）",
      "operationId": "deleteApiUsersMeWechat",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/users/{id}": {
    "get": {
      "tags": [
        "用户"
      ],
      "summary": "用户详情(管理员)",
      "operationId": "getApiUsersById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    },
    "patch": {
      "tags": [
        "用户"
      ],
      "summary": "更新用户(管理员)",
      "operationId": "patchApiUsersById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    },
    "delete": {
      "tags": [
        "用户"
      ],
      "summary": "删除用户(管理员)",
      "operationId": "deleteApiUsersById",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/users/{id}/contact": {
    "post": {
      "tags": [
        "用户"
      ],
      "summary": "获取用户联系方式",
      "operationId": "postApiUsersByIdContact",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/users/{id}/follow": {
    "post": {
      "tags": [
        "用户"
      ],
      "summary": "关注用户",
      "operationId": "postApiUsersByIdFollow",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    },
    "delete": {
      "tags": [
        "用户"
      ],
      "summary": "取消关注(幂等)",
      "operationId": "deleteApiUsersByIdFollow",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/users/{id}/password": {
    "patch": {
      "tags": [
        "用户"
      ],
      "summary": "管理员重置用户密码",
      "description": "- 仅 ADMIN 角色可调用\n- 新密码 6-72 位（bcrypt 输入上限 72 字节）\n- 密码以 bcrypt 哈希落库，不回显明文",
      "operationId": "patchApiUsersByIdPassword",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        },
        "401": {
          "description": "未登录或凭据无效"
        },
        "403": {
          "description": "需要管理员权限"
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "requestBody": {
        "description": "管理员重置用户密码",
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "password"
              ],
              "properties": {
                "password": {
                  "type": "string",
                  "description": "6-72 位(bcrypt 输入上限 72 字节)"
                }
              }
            }
          }
        }
      },
      "security": [
        {
          "sessionCookie": []
        }
      ]
    }
  },
  "/api/users/{id}/profile": {
    "get": {
      "tags": [
        "用户"
      ],
      "summary": "用户公开主页",
      "operationId": "getApiUsersByIdProfile",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "code",
                  "data",
                  "message"
                ],
                "properties": {
                  "code": {
                    "type": "integer",
                    "example": 200
                  },
                  "data": {
                    "$ref": "#/components/schemas/PublicUserProfileDTO"
                  },
                  "message": {
                    "type": "string",
                    "example": "OK"
                  }
                }
              }
            }
          }
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "description": "路径参数",
          "schema": {
            "type": "string"
          }
        }
      ],
      "security": [
        {
          "sessionCookie": []
        },
        {
          "bearerAuth": []
        }
      ]
    }
  },
  "/api/wechat/jssdk-config": {
    "get": {
      "tags": [
        "系统"
      ],
      "summary": "微信 JS-SDK 签名配置",
      "operationId": "getApiWechatJssdkConfig",
      "responses": {
        "200": {
          "description": "成功",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IResponse"
              }
            }
          }
        }
      },
      "parameters": [
        {
          "name": "url",
          "in": "query",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      ]
    }
  }
}
