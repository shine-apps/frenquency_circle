// 容器启动时执行数据库迁移(entrypoint.sh 调用)
// 用 drizzle-orm 的 migrator API,不依赖 drizzle-kit CLI
// drizzle-orm / postgres 已是 standalone node_modules 的一部分(server.js 链路用到)
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is required");
  process.exit(1);
}

// 单连接 + 应用名标识,便于在 pg_stat_activity 中辨认
const sql = postgres(url, {
  max: 1,
  connection: { application_name: "drizzle-migrate" },
});
const db = drizzle(sql);

try {
  console.log("[migrate] start");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] ok");
} catch (err) {
  console.error("[migrate] failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
