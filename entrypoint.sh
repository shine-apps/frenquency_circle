#!/bin/sh
# Entrypoint for Next.js standalone runner
# 以 root 启动:修正挂载卷权限,再用 su-exec 降权到 nextjs 用户

# 确保上传目录存在(volume 挂载后内部可能为空,或 bind mount 归 root)
mkdir -p /app/public/uploads
chown -R nextjs:nodejs /app/public/uploads

# 降权执行,保证运行时非 root
exec su-exec nextjs node server.js
