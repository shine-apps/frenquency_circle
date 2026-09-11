# 请求库

项目当前**只使用**简单版 `http`：`src/http/http.ts`（基于 `uni.request` 的单 token 封装）。

`src/http/alova.ts` 与 `src/http/vue-query.ts` 是 unibest 模板自带的备选实现，本项目**未使用**，请不要在新代码里引用；确认不再需要时可整体删除（连同 `package.json` 里的 `alova` / `@alova/*` 依赖）。

## 使用

```ts
import { http } from '@/http/http'

interface ProfileDTO {
  id: string
  nickname: string
}

export function getProfile() {
  return http.get<ProfileDTO>('/api/auth/me')
}

export function updateProfile(data: Partial<ProfileDTO>) {
  return http.post('/api/users/me/profile', data)
}
```

- 成功时 resolve 业务 `data`；**业务码 2xx（含 201/203）都算成功**（后端创建类接口返回 201，如 `POST /api/auth/sms/send`）。
- 业务错误、登录失效(401)、HTTP 状态码异常与网络异常统一 reject `HttpError`：

```ts
import type { HttpError } from '@/http/types'

try {
  const profile = await getProfile()
  console.log(profile.nickname)
}
catch (error) {
  const httpError = error as HttpError
  console.log(httpError.type, httpError.message, httpError.statusCode)
}
```

调用方需要自行处理错误提示时传 `hideErrorToast: true`：

```ts
http.get<ProfileDTO>('/api/auth/me', undefined, undefined, {
  hideErrorToast: true,
})
```

## 免登接口（AUTH_FLOW_URLS）

登录 / 登出 / 发验证码等接口自身可能返回 401（属于预期业务错误），已登记在 `http.ts` 的 `AUTH_FLOW_URLS`，这些接口的 401 **不会**触发「清理登录态并跳登录页」。新增同类接口请同步补充该列表。

## 认证方式

- 单 token（JWT）+ `Authorization: Bearer` 头，由 `src/store/token.ts` 持久化管理，有效期以后端登录响应的 `expiresIn` 为准；
- token 失效时由 `http.ts` 清理登录态并跳转登录页（**没有** refresh token 机制）。
