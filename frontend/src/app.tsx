import React, { useEffect } from 'react';
import { useDidShow, useDidHide } from '@tarojs/taro';
// NutUI 全局主题样式（命令式组件 Toast/Dialog 等的兜底样式）
import '@nutui/nutui-react-taro/dist/styles/themes/default.css';
// 全局样式
import './app.scss';
import { useUserStore } from '@/store/user';
import { fetchCurrentUser, fromUserDTO } from '@/services/auth';

function App(props) {
  // 可以使用所有的 React Hooks
  useEffect(() => {});

  // 对应 onShow：App 启动/切回前台时恢复登录态，并校验 token
  useDidShow(() => {
    // 1. 同步从存储恢复登录态（避免其他页面修改 store 后状态不一致）
    useUserStore.getState().hydrate();
    // 2. 若存在 token，异步校验 + 刷新用户信息；失败不强制登出
    //    - 401 已由 services/request.ts 拦截自动 clearToken + reLaunch 登录页
    //    - 5xx/网络异常保留登录态，让用户离线浏览
    const { token } = useUserStore.getState();
    if (token) {
      fetchCurrentUser()
        .then((dto) => {
          // 用 DB 返回的最新 UserDTO 更新本地 user（保持 token 不变）
          // fromUserDTO 统一字段名映射(avatar / avatarUrl 都写回)
          useUserStore.getState().updateUser(fromUserDTO(dto));
        })
        .catch(() => {
          // 忽略：401 已在 request.ts 处理；其他错误保留现状
        });
    }
  });

  // 对应 onHide
  useDidHide(() => {});

  return props.children;
}

export default App;
