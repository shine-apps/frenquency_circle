import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { Button, Input, Tabs, Checkbox } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { useUserStore } from '@/store/user';
import {
  sendSmsCode,
  loginByCredentials,
  loginByPhone,
  loginByWechat,
  toUserInfo,
  type AuthUser,
} from '@/services/auth';
import styles from './index.module.scss';

/** 大陆手机号正则 */
const PHONE_RE = /^1[3-9]\d{9}$/;
/** 短信验证码长度 */
const CODE_LEN = 6;
/** 验证码倒计时秒数 */
const COUNTDOWN = 60;

/**
 * 微信 onGetPhoneNumber 回调事件 detail 形状。
 * 注意:NutUI Button 继承 Taro 原生 Button,onGetPhoneNumber 类型未暴露,这里手动声明。
 */
interface WxPhoneEvent {
  detail: {
    code?: string;
    errMsg?: string;
  };
}

const LoginPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'phone' | 'password'>('phone');
  // 短信登录表单
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  // 密码登录表单
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // 公共状态
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 卸载时清理倒计时
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // 已登录用户直接跳首页(避免重复登录)
  Taro.useDidShow(() => {
    if (useUserStore.getState().isLoggedIn) {
      Taro.reLaunch({ url: '/pages/index/index' });
    }
  });

  // 微信小程序原生能力仅在 weapp 端可用
  const isWeapp = process.env.TARO_ENV === 'weapp';

  /** 轻量提示,使用 Taro 原生 showToast,跨端一致 */
  const tip = (msg: string) => {
    Taro.showToast({ title: msg, icon: 'none', duration: 2000 });
  };

  // ========== 发送短信验证码 ==========
  const handleSendCode = async () => {
    if (!PHONE_RE.test(phone)) {
      tip('请输入正确的手机号');
      return;
    }
    if (!agreed) {
      tip('请先阅读并同意协议');
      return;
    }
    setSendingCode(true);
    try {
      await sendSmsCode(phone);
      tip('验证码已发送');
      setCountdown(COUNTDOWN);
      timerRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (e) {
      tip((e as Error).message);
    } finally {
      setSendingCode(false);
    }
  };

  // ========== 登录成功统一处理 ==========
  const handleLoginSuccess = (token: string, user: AuthUser) => {
    useUserStore.getState().login({ token, user: toUserInfo(user) });
    Taro.reLaunch({ url: '/pages/mine/index' });
  };

  // ========== 手机号 + 验证码登录 ==========
  const handlePhoneLogin = async () => {
    if (!agreed) {
      tip('请先阅读并同意协议');
      return;
    }
    if (!PHONE_RE.test(phone)) {
      tip('请输入正确的手机号');
      return;
    }
    if (smsCode.length !== CODE_LEN) {
      tip(`请输入 ${CODE_LEN} 位验证码`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await loginByPhone(phone, smsCode);
      handleLoginSuccess(res.token, res.user);
    } catch (e) {
      tip((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ========== 邮箱 + 密码登录 ==========
  const handlePasswordLogin = async () => {
    if (!agreed) {
      tip('请先阅读并同意协议');
      return;
    }
    if (!email || !password) {
      tip('请输入邮箱和密码');
      return;
    }
    setSubmitting(true);
    try {
      const res = await loginByCredentials(email, password);
      handleLoginSuccess(res.token, res.user);
    } catch (e) {
      tip((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ========== 微信快捷登录(仅 weapp) ==========
  const handleGetPhoneNumber = async (e: WxPhoneEvent) => {
    if (e.detail.errMsg !== 'getPhoneNumber:ok' || !e.detail.code) {
      tip('取消微信登录');
      return;
    }
    if (!agreed) {
      tip('请先阅读并同意协议');
      return;
    }
    const phoneCode = e.detail.code;
    setSubmitting(true);
    try {
      // 先调 Taro.login 拿到 js_code,再连同 phoneCode 一起送后端
      const { code: jsCode } = await Taro.login();
      const res = await loginByWechat(jsCode, phoneCode);
      handleLoginSuccess(res.token, res.user);
    } catch (err) {
      tip((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className={styles.page}>
      {/* 1. Logo 区 */}
      <View className={styles.header}>
        <View className={styles.logo}>圈</View>
        <Text className={styles.title}>Frequency Circle</Text>
        <Text className={styles.subtitle}>登录开启你的频率社交</Text>
      </View>

      {/* 2. 微信快捷登录(仅 weapp) */}
      {isWeapp && (
        <View className={styles.wechatSection}>
          <Button
            type="primary"
            shape="round"
            block
            size="large"
            color="#07c160"
            openType="getPhoneNumber"
            onGetPhoneNumber={handleGetPhoneNumber}
            loading={submitting}
          >
            手机号快捷登录
          </Button>
          <View className={styles.divider}>
            <View className={styles.dividerLine} />
            <Text className={styles.dividerText}>其他登录方式</Text>
            <View className={styles.dividerLine} />
          </View>
        </View>
      )}

      {/* 3. Tabs: 手机验证码 / 账号密码 */}
      <Tabs
        value={activeTab}
        onChange={(v) => setActiveTab(v as 'phone' | 'password')}
      >
        <Tabs.TabPane title="手机验证码" value="phone">
          <View className={styles.form}>
            <View className={styles.formItem}>
              <Input
                value={phone}
                onChange={setPhone}
                placeholder="请输入手机号"
                type="number"
                maxLength={11}
              />
            </View>
            <View className={styles.formItem}>
              <Input
                value={smsCode}
                onChange={setSmsCode}
                placeholder="请输入验证码"
                type="number"
                maxLength={CODE_LEN}
              />
              <Button
                size="small"
                type="default"
                disabled={countdown > 0 || sendingCode}
                onClick={handleSendCode}
              >
                {countdown > 0 ? `${countdown}s` : '获取验证码'}
              </Button>
            </View>
            <Button
              type="primary"
              shape="round"
              block
              size="large"
              loading={submitting}
              onClick={handlePhoneLogin}
            >
              登录
            </Button>
          </View>
        </Tabs.TabPane>
        <Tabs.TabPane title="账号密码" value="password">
          <View className={styles.form}>
            <View className={styles.formItem}>
              <Input
                value={email}
                onChange={setEmail}
                placeholder="邮箱 / 手机号"
              />
            </View>
            <View className={styles.formItem}>
              <Input
                value={password}
                onChange={setPassword}
                placeholder="请输入密码"
                type="password"
              />
            </View>
            <Button
              type="primary"
              shape="round"
              block
              size="large"
              loading={submitting}
              onClick={handlePasswordLogin}
            >
              登录
            </Button>
          </View>
        </Tabs.TabPane>
      </Tabs>

      {/* 4. 协议勾选 */}
      <View className={styles.agreement}>
        <Checkbox
          checked={agreed}
          onChange={(v) => setAgreed(v as boolean)}
        />
        <Text className={styles.agreementText}>
          已阅读并同意
          <Text className={styles.link}>《用户协议》</Text>
          <Text className={styles.link}>《隐私政策》</Text>
        </Text>
      </View>
    </View>
  );
};

export default LoginPage;
