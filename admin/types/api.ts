export type IResponse<T = unknown> = {
  /** 业务码，镜像 HTTP 状态码：200/201 成功，4xx/5xx 失败 */
  code: number
  /** 成功为业务数据；失败为 null */
  data: T
  /** 成功为 "OK"；失败为人类可读的错误描述 */
  message: string
  /** 仅校验失败等场景附带（如 zod flatten 结果） */
  details?: unknown
}

export type Paginated<T> = {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export type UserDTO = {
  id: string
  email: string
  name: string
  role: string
  createdAt: string
  updatedAt: string
}
