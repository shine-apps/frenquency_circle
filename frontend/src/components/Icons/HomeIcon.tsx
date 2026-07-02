import React from 'react';

export interface IconProps {
  /** 图标尺寸,单位 rpx,默认 44 */
  size?: number | string;
  /** 图标颜色,默认 currentColor (跟随父级 color) */
  color?: string;
  /** 是否为选中态,用于切换描边粗细 */
  active?: boolean;
}

/**
 * 首页图标 (房屋轮廓)
 * 使用 stroke 而非 fill,方便 active 态切换粗细
 */
const HomeIcon: React.FC<IconProps> = ({
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
    <path
      d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V10.5Z"
      stroke={color}
      strokeWidth={active ? 2 : 1.6}
      strokeLinejoin="round"
    />
  </svg>
);

export default HomeIcon;
