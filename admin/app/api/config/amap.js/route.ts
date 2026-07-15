/**
 * GET /api/config/amap.js
 *
 * 运行时把 AMAP_KEY / AMAP_SECURITY_CODE 注入到 H5 浏览器,
 * 替代原先 webpack defineConstants 构建期内联(已废弃)。
 *
 * 响应体是一段 JavaScript,在 H5 index.html 中通过
 *   <script src="/api/config/amap.js"></script>
 * 同步加载,在 Taro bundle 之前执行,设置 window.__AMAP_KEY__ 等全局变量。
 *
 * 设计要点:
 * - 无需鉴权:Key 本就是给浏览器前端用的(同源加载,无敏感泄露增量)
 * - Content-Type: application/javascript,允许浏览器以 JS 解析并缓存
 * - Cache-Control: no-cache:避免部署后浏览器缓存旧值,新 key 立即生效
 * - 空值兜底:AMAP_KEY 为空时,window.__AMAP_KEY__ 设为空串,
 *   H5 加载高德 SDK 时会失败,业务侧捕获错误后降级(地图功能不可用)
 */
export function GET() {
  const key = process.env.AMAP_KEY ?? ""
  const securityCode = process.env.AMAP_SECURITY_CODE ?? ""

  // 注意:key/securityCode 可能含特殊字符,用 JSON.stringify 转义
  // (双引号、反斜杠、换行等),避免破坏 JS 字符串字面量
  const body = `window.__AMAP_KEY__=${JSON.stringify(key)};window.__AMAP_SECURITY_CODE__=${JSON.stringify(securityCode)};`

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  })
}
