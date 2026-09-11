-- 微信登录相关清理（历史数据 + 废弃预留列）。
--
-- 1) 清理旧版「微信小程序手机号登录」遗留的绑定记录。
--    旧实现把手机号写进 provider_account_id（provider='wechat-miniprogram'），
--    与新版「微信绑定 = openid」语义冲突：会让绑定状态判定把「手机号登录」误判为
--    「已绑定微信」，也会让静默登录查不到真正的 openid 绑定。
--    旧记录里的 openid 从未落库，无法迁移，故直接删除；用户下次微信手机号授权
--    登录时会自动重新写入 openid 绑定。
DELETE FROM "accounts"
WHERE "provider" = 'wechat-miniprogram'
  AND "provider_account_id" ~ '^1[3-9][0-9]{9}$';
--> statement-breakpoint
-- 2) 删除 users.wechat_openid 预留列。
--    微信 openid 绑定关系统一存放在 accounts 表
--    (provider='wechat-miniprogram', provider_account_id=openid)，
--    该列从未被写入过，保留会造成「双写漂移」的误导，故直接删除。
ALTER TABLE "users" DROP COLUMN "wechat_openid";
