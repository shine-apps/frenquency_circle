export { auth as proxy } from "@/auth"

export const config = {
  // /teacher 为教师后台子系统,守卫逻辑复用 auth.config 的 authorized 回调
  matcher: ["/admin/:path*", "/teacher/:path*"],
}
