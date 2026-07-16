import React, { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Avatar, Tag, Button, Popup } from '@nutui/nutui-react-taro';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { getCircle, contactCircle } from '@/services/circles';
import { useUserStore } from '@/store/user';
import styles from './index.module.scss';

/** 活动时间格式化(简化:YYYY-MM-DD HH:mm),空值返回"时间待定" */
function formatDateTime(iso: string | null): string {
  if (!iso) return '时间待定';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '时间待定';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '时间待定';
  }
}

/** 创建时间格式化(只到日) */
function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch {
    return '';
  }
}

/**
 * 圈子详情页。
 *
 * 数据流:
 * - useDidShow 时根据路由 id 调 getCircle,刷新数据(从创建页编辑返回时也需要刷新)
 * - 非创建者:底部"联系老师"按钮调 contactCircle,弹出底部 ContactSheet
 * - 创建者:底部"编辑圈子信息"按钮跳 pages/create-circle?id=xxx,成员数下方额外展示被联系次数
 *
 * 边界:
 * - 圈子不存在(404)展示"该圈子已不存在"+ 返回按钮
 * - 成员已满展示"圈子已满"提示,但联系按钮仍可点击(学员仍可联系老师加备选)
 *
 * 简化:
 * - 活动地点用 NutUI Card 形式展示地址文本,不渲染 <Map>(spec 允许)
 */
const CirclePage: React.FC = () => {
  const router = useRouter();
  const user = useUserStore((s) => s.user);

  // 路由参数 id(Taro 4 同步访问;若类型提示 Promise,用 getCurrentInstance 兜底)
  const circleId: string = (router?.params?.id as string) || '';

  const [circle, setCircle] = useState<CircleDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // 联系老师相关状态
  const [contactOpen, setContactOpen] = useState(false);
  const [contactInfo, setContactInfo] = useState<{
    phone: string | null;
    wechat: string | null;
  } | null>(null);
  const [contactLoading, setContactLoading] = useState(false);

  /** 拉取圈子详情 */
  const fetchCircle = async (id: string): Promise<void> => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getCircle(id);
      setCircle(data);
      setNotFound(false);
    } catch (e) {
      const err = e as Error;
      // 404 或其他错误统一进入"已不存在"态
      setNotFound(true);
      // 静默:不发 toast,UI 直接展示
      // eslint-disable-next-line no-console
      console.warn('[Circle] fetch error:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  // 进入与每次展示时刷新(从创建页编辑返回也需要刷新)
  useDidShow(() => {
    void fetchCircle(circleId);
  });

  /** 是否为创建者 */
  const isCreator: boolean = !!(circle && user && circle.creatorId === user.id);

  /** 成员是否已满 */
  const isFull: boolean = !!(
    circle &&
    circle.maxMembers !== null &&
    circle.maxMembers !== undefined &&
    circle.memberCount >= circle.maxMembers
  );

  /** 联系老师:优先 phone,phone 为 null 时改 wechat */
  const handleContact = async (): Promise<void> => {
    if (!circle || contactLoading) return;
    setContactLoading(true);
    try {
      // 优先尝试 phone;phone 为 null 时改用 wechat
      let res = await contactCircle(circle.id, 'phone');
      if (!res.contactPhone) {
        // phone 为 null,改用 wechat
        res = await contactCircle(circle.id, 'wechat');
      }
      setContactInfo({
        phone: res.contactPhone,
        wechat: res.wechat,
      });
      setContactOpen(true);
    } catch (e) {
      Taro.showToast({
        title: (e as Error).message || '联系失败',
        icon: 'none',
      });
    } finally {
      setContactLoading(false);
    }
  };

  /** 拨打电话 */
  const handleCall = (phone: string): void => {
    Taro.makePhoneCall({ phoneNumber: phone }).catch(() => {
      Taro.showToast({ title: '拨号取消', icon: 'none' });
    });
  };

  /** 复制微信号 */
  const handleCopyWechat = (wechat: string): void => {
    Taro.setClipboardData({ data: wechat }).then(() => {
      Taro.showToast({ title: '已复制', icon: 'success', duration: 800 });
    });
  };

  /** 跳编辑页 */
  const handleEdit = (): void => {
    if (!circle) return;
    Taro.navigateTo({ url: `/pages/create-circle/index?id=${circle.id}` });
  };

  /** 返回上一页 */
  const handleBack = (): void => {
    Taro.navigateBack().catch(() => {
      Taro.reLaunch({ url: '/pages/index/index' });
    });
  };

  // ====== 边界态:加载中 ======
  if (loading && !circle) {
    return (
      <View className={styles.page}>
        <View className={styles.center}>
          <Text className={styles.muted}>加载中...</Text>
        </View>
      </View>
    );
  }

  // ====== 边界态:圈子不存在 ======
  if (notFound || !circle) {
    return (
      <View className={styles.page}>
        <View className={styles.center}>
          <Text className={styles.title}>该圈子已不存在</Text>
          <Button
            type="primary"
            shape="round"
            size="small"
            onClick={handleBack}
            className={styles.actionBtn}
          >
            返回
          </Button>
        </View>
      </View>
    );
  }

  const maxMembersText = circle.maxMembers ? String(circle.maxMembers) : '不限';

  return (
    <View className={styles.page}>
      <ScrollView scrollY className={styles.scroll}>
        {/* ====== 0. 状态横幅(仅 pending / rejected 展示) ====== */}
        {circle.status === 'pending' && (
          <View
            className={`${styles.statusBanner} ${styles.statusBannerWarning}`}
          >
            <Text className={styles.statusBannerText}>
              该圈子正在审核中,暂不对外公开。审核通过后将自动上线。
            </Text>
          </View>
        )}
        {circle.status === 'rejected' && (
          <View
            className={`${styles.statusBanner} ${styles.statusBannerError}`}
          >
            <Text className={styles.statusBannerText}>
              该圈子审核未通过。可修改信息后联系管理员重新审核。
            </Text>
          </View>
        )}

        {/* ====== 1. 标题 + 标签 ====== */}
        <View className={styles.header}>
          <Text className={styles.title}>{circle.title}</Text>
          {circle.tags.length > 0 && (
            <ScrollView scrollX className={styles.tagScroll}>
              <View className={styles.tagRow}>
                {circle.tags.map((t) => (
                  <Tag key={t.id} type="primary" plain className={styles.tagItem}>
                    {t.name}
                  </Tag>
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        {/* ====== 2. 创建者卡片 ====== */}
        <View className={styles.creatorCard}>
          <Avatar
            size="normal"
            shape="round"
            src={circle.creator.avatarUrl || undefined}
          >
            {circle.creator.name ? circle.creator.name[0] : '?'}
          </Avatar>
          <View className={styles.creatorInfo}>
            <View className={styles.creatorNameRow}>
              <Text className={styles.creatorName}>{circle.creator.name}</Text>
              <Tag type="warning" className={styles.roleChip}>
                传承人
              </Tag>
            </View>
            <Text className={styles.creatorMeta}>
              创建于 {formatDate(circle.createdAt)}
            </Text>
          </View>
        </View>

        {/* ====== 3. 介绍 ====== */}
        <View className={styles.section}>
          <Text className={styles.sectionTitle}>圈子介绍</Text>
          <Text className={styles.sectionContent}>{circle.description}</Text>
        </View>

        {/* ====== 4. 活动时间 ====== */}
        <View className={styles.section}>
          <Text className={styles.sectionTitle}>活动时间</Text>
          <Text className={styles.sectionContent}>
            {formatDateTime(circle.activityTime)}
          </Text>
        </View>

        {/* ====== 5. 活动地点(简化:仅展示地址文本,不渲染 Map) ====== */}
        <View className={styles.section}>
          <Text className={styles.sectionTitle}>活动地点</Text>
          <Text className={styles.sectionContent}>
            {circle.address || '地点待定'}
          </Text>
        </View>

        {/* ====== 6. 成员人数 + (创建者额外展示被联系次数) ====== */}
        <View className={styles.section}>
          <View className={styles.memberRow}>
            <Text className={styles.sectionTitle}>成员人数</Text>
            <Text className={styles.memberCount}>
              {circle.memberCount}/{maxMembersText}
            </Text>
          </View>
          {isFull && (
            <Text className={styles.fullHint}>圈子已满,可联系老师加备选</Text>
          )}
          {isCreator && (
            <Text className={styles.contactCountText}>
              被联系 {circle.contactCount} 次
            </Text>
          )}
        </View>
      </ScrollView>

      {/* ====== 底部固定按钮 ====== */}
      <View className={styles.footer}>
        {isCreator ? (
          <Button
            type="primary"
            shape="round"
            block
            size="large"
            onClick={handleEdit}
          >
            编辑圈子信息
          </Button>
        ) : (
          <Button
            type="primary"
            shape="round"
            block
            size="large"
            loading={contactLoading}
            onClick={handleContact}
          >
            联系老师
          </Button>
        )}
      </View>

      {/* ====== 联系方式底部弹层 ====== */}
      <Popup
        visible={contactOpen}
        position="bottom"
        round
        onClose={() => setContactOpen(false)}
      >
        <View className={styles.sheet}>
          <Text className={styles.sheetTitle}>联系方式</Text>
          {contactInfo &&
          (contactInfo.phone || contactInfo.wechat) ? (
            <>
              {contactInfo.phone && (
                <View
                  className={styles.sheetItem}
                  onClick={() => handleCall(contactInfo.phone as string)}
                >
                  <Text className={styles.sheetItemLabel}>电话</Text>
                  <Text className={styles.sheetItemValue}>
                    {contactInfo.phone} ›
                  </Text>
                </View>
              )}
              {contactInfo.wechat && (
                <View
                  className={styles.sheetItem}
                  onClick={() => handleCopyWechat(contactInfo.wechat as string)}
                >
                  <Text className={styles.sheetItemLabel}>微信</Text>
                  <Text className={styles.sheetItemValue}>
                    {contactInfo.wechat} 复制
                  </Text>
                </View>
              )}
              <Text className={styles.sheetHint}>
                点击电话直接拨打,点击微信复制微信号
              </Text>
            </>
          ) : (
            <Text className={styles.sheetEmpty}>老师未提供联系方式</Text>
          )}
        </View>
      </Popup>
    </View>
  );
};

export default CirclePage;
