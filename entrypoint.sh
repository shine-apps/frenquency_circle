#!/bin/sh
# Entrypoint for Next.js standalone runner
# 以 root 启动:修正挂载卷权限,再用 gosu 降权到 nextjs 用户

# 确保上传目录存在(volume 挂载后内部可能为空,或 bind mount 归 root)
mkdir -p /app/public/uploads
chown -R nextjs:nodejs /app/public/uploads

# 启动前执行数据库迁移(失败则退出,避免带着过期 schema 起服务)
# drizzle-orm 的 migrator 会在 __drizzle_migrations 表中记录已执行的迁移
echo "[entrypoint] running database migrations..."
if ! gosu nextjs node db/migrate.mjs; then
  echo "[entrypoint] migration failed, aborting"
  exit 1
fi

# 降权执行,保证运行时非 root
exec gosu nextjs node server.js
