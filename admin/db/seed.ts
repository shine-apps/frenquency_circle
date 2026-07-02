import "dotenv/config"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users } from "@/db/schema"

async function main() {
  console.log("🌱 Seeding database…")

  const adminHash = await bcrypt.hash("admin123", 10)
  const userHash = await bcrypt.hash("user123", 10)

  // 幂等：使用 onConflictDoNothing，重复运行不会因唯一约束崩溃
  await db
    .insert(users)
    .values({
      email: "admin@example.com",
      name: "Admin User",
      passwordHash: adminHash,
      role: "ADMIN",
    })
    .onConflictDoNothing({ target: users.email })

  await db
    .insert(users)
    .values({
      email: "user@example.com",
      name: "Regular User",
      passwordHash: userHash,
      role: "USER",
    })
    .onConflictDoNothing({ target: users.email })

  console.log("✅ Seeded admin and user (idempotent).")
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ Seed failed:", err)
  process.exit(1)
})
