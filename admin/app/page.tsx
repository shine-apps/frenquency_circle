import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function Home() {
    const session = await auth();

    // 未登录 → 跳登录页
    if (!session?.user) redirect("/login");

    // 仅管理员可进入后台；已登录非管理员展示无权限提示，
    // 避免与 admin/layout.tsx 的 role 守卫形成 / ↔ /admin 重定向死循环
    if (session.user.role !== "ADMIN") {
        return (
            <main className="flex min-h-svh items-center justify-center p-4">
                <div className="space-y-4 text-center">
                    <div className="space-y-2">
                        <h1 className="text-xl font-semibold">无访问权限</h1>
                        <p className="text-sm text-muted-foreground">
                            当前账号没有后台访问权限，请使用管理员账号登录。
                        </p>
                    </div>
                    <div className="space-y-1 text-sm">
                        <p>
                            当前账号：
                            <span className="font-medium">
                                {session.user.name || session.user.email}
                            </span>
                        </p>
                        {session.user.email ? (
                            <p className="text-xs text-muted-foreground">{session.user.email}</p>
                        ) : null}
                    </div>
                    <form
                        action={async () => {
                            "use server";
                            await signOut({ redirectTo: "/login" });
                        }}
                    >
                        <Button type="submit" variant="outline">
                            退出登录
                        </Button>
                    </form>
                </div>
            </main>
        );
    }

    redirect("/admin");
}
