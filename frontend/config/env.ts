/**
 * 最小化 .env 加载器(无第三方依赖)。
 *
 * 在 config/index.ts 首行 import 此文件,确保 .env 中的环境变量
 * 在 dev.ts / prod.ts 模块求值前注入 process.env。
 *
 * 根目录 .gitignore 已忽略 .env,此文件仅读取本地 .env,不影响版本库。
 * 仅处理 KEY=VALUE 格式,支持引号包裹与 # 注释行,不处理多行值。
 */

import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // 空行或注释跳过
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // 去除首尾引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // 不覆盖已存在的环境变量(允许 shell / CI 注入优先)
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
