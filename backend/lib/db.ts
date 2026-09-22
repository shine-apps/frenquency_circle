import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "@/db/schema"

declare global {
  var __db__: ReturnType<typeof postgres> | undefined
}

const client =
  globalThis.__db__ ??
  postgres(process.env.DATABASE_URL!, { prepare: false })

if (process.env.NODE_ENV !== "production") {
  globalThis.__db__ = client
}

export const db = drizzle(client, { schema })
