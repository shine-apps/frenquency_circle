import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { Avatar, Button, Input } from '@nutui/nutui-react-taro';
import Taro, { useDidShow } from '@tarojs/taro';
import { useUserStore } from '@/store/user';
import {
  updateMyProfile,
  fromUserDTO,
  type UpdateMyProfileInput,
} from '@/services/auth';
import { uploadFile } from '@/services/upload';
import styles from './index.module.scss';

/** 邮箱基础校验(与服务端 zod email() 一致:有 @ 与 .) */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ProfilePage: React.FC = () => {
  const user = useUserStore((s) => s.user);
  const updateUser = useUserStore((s) => s.updateUser);

  // 表单状态(初值在 useEffect 里从 store 取)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  // H5 隐藏 file input ref(Taro.chooseMedia 在 H5 不可靠时兜底)
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 未登录守卫:进入页面时若未登录,reLaunch 回登录页
  // 与 pages/login/index.tsx 行为对称
  useDidShow(() => {
    if (!useUserStore.getState().isLoggedIn) {
      Taro.reLaunch({ url: '/pages/login/index' });
    }
  });

  // 挂载时从 store 取初值,避免与后端往返
  // 依赖 [user?.id] 而非 [user]:app.tsx 的 useDidShow 会周期性用最新 UserDTO
  // 刷 store(updateUser 会改变 user 引用),若依赖整个 user 会导致用户在编辑表单
  // 时被静默重置。仅在登录态变化/用户切换时初始化即可。
  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setEmail(user.email ?? '');
      setAvatarUrl(user.avatarUrl ?? '');
    }
  }, [user?.id]);

  /** 轻量提示 */
  const tip = (msg: string) => {
    Taro.showToast({ title: msg, icon: 'none', duration: 2000 });
  };

  /**
   * 选择图片 → 调 uploadFile → 自动回填 URL。
   * 三端差异:
   * - weapp/tt:Taro.chooseMedia 取 tempFilePath 字符串
   * - H5:Taro.chooseMedia 取 originalFileObj(File);若不可用则回退到隐藏 input
   */
  const handlePickAvatar = async () => {
    try {
      const res = await Taro.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        maxDuration: 30,
        camera: 'back',
      });
      const f = res.tempFiles?.[0];
      if (!f) return;
      // H5 端优先用 originalFileObj(File 对象),weapp/tt 端用 tempFilePath(字符串)
      const file: string | File =
        f.originalFileObj ?? f.tempFilePath;
      const filename =
        (f.originalFileObj && f.originalFileObj.name) ||
        deriveFilenameFromPath(f.tempFilePath) ||
        'avatar.jpg';
      await doUpload(file, filename);
    } catch (e) {
      // 用户取消选择时 chooseMedia 会 reject,这里静默
      const err = e as Error & { errMsg?: string };
      if (err?.errMsg && /cancel/i.test(err.errMsg)) return;
      // H5 兜底:触发隐藏 file input
      if (process.env.TARO_ENV === 'h5') {
        fileInputRef.current?.click();
        return;
      }
      tip(`选择图片失败: ${err.message}`);
    }
  };

  /** H5 file input 变更兜底 */
  const handleH5FileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) doUpload(f, f.name);
    // 清空 value,使同一文件可再次选择
    e.target.value = '';
  };

  /** 实际执行上传 */
  const doUpload = async (file: string | File, name: string) => {
    setUploading(true);
    try {
      const { url } = await uploadFile({ file, name, purpose: 'avatar' });
      setAvatarUrl(url);
      tip('头像已上传');
    } catch (e) {
      tip((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  /** 清除头像(空串在保存时由后端归一为 null) */
  const handleClearAvatar = () => {
    setAvatarUrl('');
  };

  /** 提交保存 */
  const handleSave = async () => {
    // 1. 客户端校验
    const trimmedName = name.trim();
    if (!trimmedName) {
      tip('昵称不能为空');
      return;
    }
    if (trimmedName.length > 100) {
      tip('昵称过长(最多 100 字符)');
      return;
    }
    if (email && !EMAIL_RE.test(email)) {
      tip('邮箱格式不正确');
      return;
    }

    // 2. 只传变更字段
    const patch: UpdateMyProfileInput = {};
    if (trimmedName !== user?.name) patch.name = trimmedName;
    if (email !== user?.email) patch.email = email;
    if ((avatarUrl ?? '') !== (user?.avatarUrl ?? user?.avatar ?? '')) {
      patch.avatarUrl = avatarUrl ?? '';
    }
    if (Object.keys(patch).length === 0) {
      tip('未做修改');
      return;
    }

    setSubmitting(true);
    try {
      const dto = await updateMyProfile(patch);
      // 3. 同步本地 store(avatar/avatarUrl 都更新)
      updateUser(fromUserDTO(dto));
      tip('保存成功');
      setTimeout(() => Taro.navigateBack(), 600);
    } catch (e) {
      tip((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // 头像 fallback:已登录显示昵称首字,未登录显示"游"
  const avatarFallback = user?.name ? user.name[0] : '游';

  return (
    <View className={styles.page}>
      {/* H5 隐藏 file input(chooseMedia 不可用时兜底) */}
      {process.env.TARO_ENV === 'h5' && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleH5FileChange}
          className={styles.hiddenFileInput}
        />
      )}

      {/* 1. 顶部头像预览 + 选择/清除按钮 */}
      <View className={styles.avatarSection}>
        <Avatar
          size="large"
          shape="round"
          className={styles.avatar}
          src={avatarUrl}
        >
          {avatarFallback}
        </Avatar>
        <View className={styles.avatarActions}>
          <Button
            type="default"
            size="small"
            shape="round"
            className={styles.avatarBtn}
            loading={uploading}
            disabled={uploading}
            onClick={handlePickAvatar}
          >
            {uploading ? '上传中...' : avatarUrl ? '更换头像' : '选择图片'}
          </Button>
          {avatarUrl && !uploading && (
            <Button
              type="default"
              size="small"
              shape="round"
              className={styles.avatarBtn}
              onClick={handleClearAvatar}
            >
              清除
            </Button>
          )}
        </View>
      </View>

      {/* 2. 表单 */}
      <View className={styles.form}>
        <View className={styles.field}>
          <Text className={styles.label}>昵称</Text>
          <Input
            value={name}
            onChange={(v) => setName(v)}
            placeholder="请输入昵称"
            maxLength={100}
            className={styles.input}
          />
        </View>
        <View className={styles.field}>
          <Text className={styles.label}>邮箱</Text>
          <Input
            value={email}
            onChange={(v) => setEmail(v)}
            placeholder="请输入邮箱"
            className={styles.input}
          />
        </View>
        <Text className={styles.hint}>
          修改邮箱后再次登录将使用新邮箱;昵称最长 100 字符。
        </Text>
      </View>

      {/* 3. 底部固定保存按钮 */}
      <View className={styles.saveBar}>
        <Button
          type="primary"
          shape="round"
          block
          size="large"
          loading={submitting}
          onClick={handleSave}
        >
          保存
        </Button>
      </View>
    </View>
  );
};

/** 从 tempFilePath 推断文件名(weapp/tt 端 File.name 拿不到) */
function deriveFilenameFromPath(p: string): string {
  if (!p) return 'avatar.jpg'
  const seg = p.split('/').pop() ?? 'avatar.jpg'
  return seg.includes('.') ? seg : `${seg}.jpg`
}

export default ProfilePage;
