import { create } from 'zustand';

export interface UserInfo {
  /** 用户昵称 */
  name: string;
  /** 绑定手机号(脱敏或完整) */
  phone?: string;
  /** 头像 URL(可选) */
  avatar?: string;
}

interface UserState {
  /** 当前用户信息(未登录时也保留 mock 数据,用于占位展示) */
  user: UserInfo;
  /** 是否已登录 */
  isLoggedIn: boolean;
  /** 模拟登录:实际项目应替换为真实登录 API */
  login: () => void;
  /** 模拟登出 */
  logout: () => void;
  /** 部分更新用户信息 */
  updateUser: (patch: Partial<UserInfo>) => void;
}

/**
 * Mock 用户数据,用于未登录态的占位展示
 * 后续接入真实登录 API 时,仅需替换 login / logout 内部实现
 */
const MOCK_USER: UserInfo = {
  name: '示例用户',
  phone: '138****8888',
  avatar: undefined,
};

/**
 * 全局用户态 Store
 * 使用 zustand,避免引入 Redux 等重型状态库
 */
export const useUserStore = create<UserState>((set) => ({
  user: MOCK_USER,
  isLoggedIn: false,
  login: () => set({ isLoggedIn: true }),
  logout: () => set({ isLoggedIn: false, user: MOCK_USER }),
  updateUser: (patch) =>
    set((state) => ({ user: { ...state.user, ...patch } })),
}));
