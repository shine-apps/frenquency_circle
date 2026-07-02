import { auth } from "@/auth"
import { fail } from "@/lib/api"

export type AuthGuardResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; response: Response }

export async function requireAdmin(): Promise<AuthGuardResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return {
      ok: false,
      response: fail(401, "Unauthorized"),
    }
  }
  if (session.user.role !== "ADMIN") {
    return {
      ok: false,
      response: fail(403, "Forbidden: admin role required"),
    }
  }
  return {
    ok: true,
    userId: session.user.id,
    role: session.user.role,
  }
}

export async function requireSession() {
  const session = await auth()
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: fail(401, "Unauthorized"),
    }
  }
  return {
    ok: true as const,
    userId: session.user.id,
    role: session.user.role,
    session,
  }
}
