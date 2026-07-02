import React from 'react';
import type { IconProps } from './HomeIcon';

/**
 * 「我的」图标 (人头 + 肩部轮廓)
 */
const ProfileIcon: React.FC<IconProps> = ({
  size = 44,
  color = 'currentColor',
  active = false,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* 头部 */}
    <circle
      cx="12"
      cy="8"
      r="4"
      stroke={color}
      strokeWidth={active ? 2 : 1.6}
    />
    {/* 肩部 / 身体 */}
    <path
      d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8"
      stroke={color}
      strokeWidth={active ? 2 : 1.6}
      strokeLinecap="round"
    />
  </svg>
);

export default ProfileIcon;
