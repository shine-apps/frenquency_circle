import React from 'react';
import type { IconProps } from './HomeIcon';

/**
 * 「发布」图标(圆形 + 十字加号)。
 * 用于 TabBar 中间凸起按钮。
 */
const PublishIcon: React.FC<IconProps> = ({
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
    {/* 圆形背景边框 */}
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke={color}
      strokeWidth={active ? 2 : 1.6}
    />
    {/* 十字加号 */}
    <path
      d="M12 7v10M7 12h10"
      stroke={color}
      strokeWidth={active ? 2.4 : 2}
      strokeLinecap="round"
    />
  </svg>
);

export default PublishIcon;
