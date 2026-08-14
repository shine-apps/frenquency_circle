# LocationSetter 保存职责上移(仅提供位置信息)实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `LocationSetter` 组件不再负责把位置持久化到当前用户资料,仅向父级 emit 选中的位置信息;保存(PATCH 资料)、同步 store、刷新匹配由父级页面(`index.vue`)统一处理。

**Architecture:**
- `LocationSetter.vue` 是一个"纯选点"组件:接收 `latitude/longitude/address` props 展示当前值,用户选点后通过 `update:location` emit `{ latitude, longitude, address }`,不再调用 `updateProfile`、不再操作 `userStore`、不再弹成功/失败 toast。
- `index.vue`(唯一使用方)在 `handleLocationUpdated` 回调里执行:调用 `updateProfile` 保存到后端 → 同步 `userStore.setLocation` → 更新本地 `latitude/longitude/address` ref → 重新拉取匹配 `loadAll`。未登录时仅本地更新,不发起后端保存(与兴趣标签逻辑 `handleTagsConfirmed` 保持一致)。
- 成功/失败提示统一由父级页面用 `uni.showToast` 处理。

**Tech Stack:** uni-app(Vue3 `<script setup>`)、pinia、`@wot-ui/ui`(仅 `index.vue` 未用到 toast,用 `uni.showToast`)。

---

### Task 1: 精简 `LocationSetter.vue` —— 移除持久化,仅 emit 位置信息

**Files:**
- Modify: `frontend_uniapp/src/components/LocationSetter/LocationSetter.vue`

**Step 1: 更新文件顶部注释**

把当前注释里"选中后调 PATCH /api/users/me/profile 保存位置与地址,并同步 store/user 的 setLocation"等持久化描述,改为"组件仅提供选点能力,通过 `update:location` 把选中位置 emit 给父级;是否保存到用户资料由父级决定"。

**Step 2: 移除脚本中的持久化相关 import 与 store 引用**

删除以下内容(精确匹配,保留其余代码):
- `import { useToast } from '@wot-ui/ui/components/wd-toast'`
- `import { updateProfile } from '@/api/auth'`
- `import { useUserStore } from '@/store/user'`
- `const toast = useToast()`
- `const userStore = useUserStore()`

**Step 3: 将 `saveLocation` 改写为纯 emit 函数**

把现有 `saveLocation(loc)`(内部调 `updateProfile`、`userStore.setLocation`、`toast.show`)整体替换为:

```ts
/** 选中位置:仅将位置信息 emit 给父级,由父级决定是否持久化 */
function emitLocation(loc: { latitude: number, longitude: number, address: string }): void {
  emit('update:location', loc)
}
```

**Step 4: 更新两处调用点**

- `chooseByMiniProgram` 内 `await saveLocation({ ... })` → `emitLocation({ ... })`
- `handleH5Confirm` 内 `void saveLocation(loc)` → `emitLocation(loc)`

(两者调用方不依赖 `saveLocation` 的 Promise 返回值,改为同步函数即可,无需 `await`/`void`。)

**Step 5: 更新 `update:location` emit 的注释**

将 `defineEmits` 中注释改为:`/** 用户选点完成(仅携带位置信息,是否保存由父级决定) */`

**Step 6: 检查产物 lint**

```bash
cd frontend_uniapp && npx eslint src/components/LocationSetter/LocationSetter.vue
```

Expected: 无报错(移除未使用的 import/store 引用后不再有 unused 告警)。

**Step 7: Commit**

```bash
git add frontend_uniapp/src/components/LocationSetter/LocationSetter.vue
git commit -m "refactor(LocationSetter): 仅 emit 位置信息,持久化交由父级处理"
```

---

### Task 2: `index.vue` 承接保存 —— 持久化、同步 store、刷新匹配

**Files:**
- Modify: `frontend_uniapp/src/pages/index/index.vue`

**Step 1: 引入 `updateProfile`**

在现有 `import { updateMyTags } from '@/api/auth'` 一行改为同时引入 `updateProfile`:

```ts
import { updateMyTags, updateProfile } from '@/api/auth'
```

**Step 2: 重写 `handleLocationUpdated`**

将现有 `handleLocationUpdated`(第 233-241 行)替换为:先调用 `updateProfile` 保存(仅已登录),成功后同步 store 并刷新匹配;失败时本地仍更新但提示保存失败。

```ts
/** LocationSetter 选点完成后:保存到当前用户资料(已登录)、同步 store、刷新匹配 */
async function handleLocationUpdated(loc: { latitude: number, longitude: number, address: string }): Promise<void> {
  // 先更新本地坐标/地址,让 UI 立即回显
  latitude.value = loc.latitude
  longitude.value = loc.longitude
  address.value = loc.address

  // 已登录:自动保存到我的资料(与兴趣标签保存逻辑 handleTagsConfirmed 一致)
  if (userStore.isLoggedIn) {
    try {
      const profile = await updateProfile({
        address: loc.address,
        latitude: loc.latitude,
        longitude: loc.longitude,
      })
      // 同步 store,使用后端权威返回值
      userStore.setLocation(
        profile.location ?? { latitude: loc.latitude, longitude: loc.longitude },
        profile.address ?? loc.address,
      )
    }
    catch (e) {
      console.error('[index] updateProfile failed:', e)
      uni.showToast({ title: '位置保存失败,请重试', icon: 'none' })
    }
  }
  else {
    // 未登录:仅更新本地状态用于本次匹配展示,不发起后端保存
    userStore.setLocation(
      { latitude: loc.latitude, longitude: loc.longitude },
      loc.address,
    )
  }

  if (userTags.value.length > 0) {
    loadAll(latitude.value, longitude.value, rangeKm.value)
  }
}
```

**Step 3: 检查产物 lint**

```bash
cd frontend_uniapp && npx eslint src/pages/index/index.vue
```

Expected: 无报错(`userStore`、`updateProfile` 均已 import 且使用)。

**Step 4: Commit**

```bash
git add frontend_uniapp/src/pages/index/index.vue
git commit -m "refactor(index): 由首页承接位置保存、同步 store 并刷新匹配"
```

---

### Task 3: 手工回归验证

**Files:**
- 运行: `frontend_uniapp`(H5 或微信小程序)

**Step 1: 启动项目**

按项目 `local-dev` skill 或本地脚本启动 H5。

**Step 2: 回归场景**

1. **未登录**:首页点击"选择位置"→ H5 弹层/小程序选点 → 确认后本地地址回显、匹配刷新,不发起 PATCH(网络面板无 `/api/users/me/profile` 请求)。
2. **已登录**:同样操作 → 网络面板出现 `PATCH /api/users/me/profile`,且请求体含 `address/latitude/longitude`;`userStore` 中 `location` 与 `address` 同步更新;匹配结果按新坐标刷新。
3. **失败场景**:断网或后端返回错误 → 本地回显仍更新,但出现"位置保存失败,请重试" toast;store 不误更新为错误值(采用后端返回值,异常时不 setLocation)。

**Step 3: Commit(如有额外修正)**

```bash
git add -A
git commit -m "test: 回归验证 LocationSetter 保存职责上移"
```
