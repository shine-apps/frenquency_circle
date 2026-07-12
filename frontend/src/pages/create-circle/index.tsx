import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Input, TextArea, Button } from '@nutui/nutui-react-taro';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import TagSelector from '@/components/TagSelector';
import H5LocationPicker from '@/components/H5LocationPicker';
import {
  createCircle,
  getCircle,
  updateCircle,
} from '@/services/circles';
import { updateProfile } from '@/services/auth';
import { useUserStore } from '@/store/user';
import styles from './index.module.scss';

/** 标题最大长度 */
const TITLE_MAX = 50;
/** 描述最大长度 */
const DESCRIPTION_MAX = 500;
/** 标签最大数量 */
const TAGS_MAX = 5;
/** 人数上限范围 */
const MAX_MEMBERS_MIN = 1;
const MAX_MEMBERS_MAX = 999;
/** 手机号校验(11 位) */
const PHONE_RE = /^1\d{10}$/;

/**
 * 创建/编辑圈子页。
 *
 * 路由:
 * - `/pages/create-circle/index` 新建模式
 * - `/pages/create-circle/index?id=xxx` 编辑模式:进入时调 getCircle 预填表单
 *
 * 提交流程:
 * 1. 若 `useUserStore.user.role !== 'TEACHER'`:先调 updateProfile({ role: 'TEACHER' }) 升级
 *    编辑模式理论上不会进入此分支(创建者必然已是 TEACHER),但仍兜底处理
 * 2. 新建模式调 createCircle,编辑模式调 updateCircle
 *    注意:UpdateCircleInput 不含 latitude/longitude/address(后端 PUT schema 不允许改位置),
 *    提交时排除这三个字段;若用户未重新选位置,使用原值
 * 3. 成功 Taro.redirectTo 到圈子详情页(避免返回时回到创建页)
 *
 * 简化:
 * - 活动时间用单个文本输入框,不强制格式(如"每周六上午 9:00-11:00")
 * - 活动地点选点:weapp 用 Taro.chooseLocation;H5 用 H5LocationPicker 地图选点弹层;
 *   仅展示 address 卡片,不展示经纬度
 */
const CreateCirclePage: React.FC = () => {
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const setProfile = useUserStore((s) => s.setProfile);

  // 编辑模式圈子 ID(无则为新建)
  const editId: string = (router?.params?.id as string) || '';
  const isEdit: boolean = !!editId;

  // ====== 表单状态 ======
  const [title, setTitle] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  // 编辑模式预填时缓存的 TagDTO,用于 TagSelector 已选区展示
  const [selectedTags, setSelectedTags] = useState<TagDTO[] | undefined>(undefined);
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  // 经纬度不在表单中展示,但提交时需要;编辑模式预填从 circle 取,新建模式从 chooseLocation 取
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [contactPhone, setContactPhone] = useState('');
  const [wechat, setWechat] = useState('');
  const [activityTime, setActivityTime] = useState('');
  const [maxMembers, setMaxMembers] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  // H5 端地图选点弹层显隐
  const [pickerVisible, setPickerVisible] = useState(false);

  /** 拉取圈子详情用于编辑预填 */
  const fetchForEdit = async (id: string): Promise<void> => {
    setLoading(true);
    try {
      const data = await getCircle(id);
      setTitle(data.title || '');
      setTagIds(data.tags.map((t) => t.id));
      setSelectedTags(data.tags);
      setDescription(data.description || '');
      setAddress(data.address || '');
      setLatitude(data.latitude);
      setLongitude(data.longitude);
      setContactPhone(data.contactPhone || '');
      setWechat(data.wechat || '');
      setActivityTime(data.activityTime || '');
      setMaxMembers(
        data.maxMembers !== null && data.maxMembers !== undefined
          ? String(data.maxMembers)
          : ''
      );
    } catch (e) {
      Taro.showToast({
        title: (e as Error).message || '加载圈子失败',
        icon: 'none',
      });
    } finally {
      setLoading(false);
    }
  };

  // 进入时若是编辑模式,拉取详情预填
  useDidShow(() => {
    if (isEdit && !title && !loading) {
      void fetchForEdit(editId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  /** 选地点:weapp 用 chooseLocation,H5 打开地图选点弹层 */
  const handleChooseLocation = async (): Promise<void> => {
    try {
      if (process.env.TARO_ENV === 'weapp') {
        const res = await Taro.chooseLocation({});
        setLatitude(res.latitude);
        setLongitude(res.longitude);
        setAddress(res.address || res.name || '已选择位置');
      } else {
        // H5:打开地图选点弹层(拖动选点 + 逆地理编码)
        setPickerVisible(true);
      }
    } catch (e) {
      const err = e as Error & { errMsg?: string };
      // 用户取消静默
      if (err?.errMsg && /cancel/i.test(err.errMsg)) return;
      Taro.showToast({
        title: err?.message || '定位失败,请检查授权',
        icon: 'none',
      });
    }
  };

  /** H5 选点弹层确认回调 */
  const handlePickerConfirm = (loc: {
    latitude: number;
    longitude: number;
    address: string;
  }): void => {
    setLatitude(loc.latitude);
    setLongitude(loc.longitude);
    setAddress(loc.address);
    setPickerVisible(false);
  };

  // ====== 实时校验 ======
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const trimmedPhone = contactPhone.trim();
  const trimmedWechat = wechat.trim();
  const trimmedActivityTime = activityTime.trim();

  // 必填项校验
  const titleValid: boolean =
    trimmedTitle.length >= 1 && trimmedTitle.length <= TITLE_MAX;
  const descriptionValid: boolean =
    trimmedDescription.length >= 1 && trimmedDescription.length <= DESCRIPTION_MAX;
  const tagsValid: boolean = tagIds.length >= 1 && tagIds.length <= TAGS_MAX;
  const locationValid: boolean =
    !!address && latitude !== null && longitude !== null;

  // 联系电话与微信号至少填一项
  const hasContact: boolean = trimmedPhone !== '' || trimmedWechat !== '';
  // 手机号格式校验(若填写)
  const phoneValid: boolean = trimmedPhone === '' || PHONE_RE.test(trimmedPhone);

  // 人数上限校验(若填写)
  const maxMembersNum: number | null = maxMembers === '' ? null : Number(maxMembers);
  const maxMembersValid: boolean =
    maxMembers === '' ||
    (!isNaN(maxMembersNum as number) &&
      (maxMembersNum as number) >= MAX_MEMBERS_MIN &&
      (maxMembersNum as number) <= MAX_MEMBERS_MAX);

  // 表单整体可提交
  const canSubmit: boolean =
    titleValid &&
    descriptionValid &&
    tagsValid &&
    locationValid &&
    hasContact &&
    phoneValid &&
    maxMembersValid &&
    !submitting;

  // 错误提示(用于按钮下方展示)
  const contactErr: string = !hasContact ? '请至少填写一种联系方式' : '';
  const phoneErr: string = !phoneValid ? '手机号格式不正确(11 位)' : '';
  const maxMembersErr: string = !maxMembersValid
    ? `人数上限范围 ${MAX_MEMBERS_MIN}-${MAX_MEMBERS_MAX}`
    : '';

  /** 提交 */
  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // 1. 若 role 不是 TEACHER,先升级(编辑模式理论不会进此分支)
      const currentRole = useUserStore.getState().user?.role;
      if (currentRole !== 'TEACHER') {
        try {
          const profile = await updateProfile({ role: 'TEACHER' });
          setProfile(profile);
        } catch (e) {
          Taro.showToast({
            title: (e as Error).message || '升级传承人失败',
            icon: 'none',
          });
          setSubmitting(false);
          return;
        }
      }

      const lat = latitude as number;
      const lng = longitude as number;
      const finalAddress = address || '已定位';
      const finalMaxMembers =
        maxMembers === '' ? undefined : Number(maxMembers);

      if (isEdit) {
        // 编辑模式:UpdateCircleInput 不含 latitude/longitude/address
        const patch: UpdateCircleInput = {
          title: trimmedTitle,
          tagIds,
          description: trimmedDescription,
          contactPhone: trimmedPhone || undefined,
          wechat: trimmedWechat || undefined,
          activityTime: trimmedActivityTime || undefined,
          maxMembers: finalMaxMembers,
        };
        await updateCircle(editId, patch);
        Taro.redirectTo({ url: `/pages/circle/index?id=${editId}` });
      } else {
        // 新建模式
        const res = await createCircle({
          title: trimmedTitle,
          tagIds,
          description: trimmedDescription,
          latitude: lat,
          longitude: lng,
          address: finalAddress,
          contactPhone: trimmedPhone || undefined,
          wechat: trimmedWechat || undefined,
          activityTime: trimmedActivityTime || undefined,
          maxMembers: finalMaxMembers,
        });
        Taro.redirectTo({ url: `/pages/circle/index?id=${res.circleId}` });
      }
    } catch (e) {
      Taro.showToast({
        title: (e as Error).message || '提交失败',
        icon: 'none',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 已选标签数量提示
  const tagsCountText = `${tagIds.length}/${TAGS_MAX}`;

  // 是否展示"加载中"(编辑模式预填阶段)
  const showLoading = isEdit && loading && !title;

  // 表单底部错误提示(取第一个非空)
  const formErr: string =
    contactErr || phoneErr || maxMembersErr || '';

  // 标题字数提示
  const titleCount = useMemo(
    () => `${title.length}/${TITLE_MAX}`,
    [title.length]
  );
  const descCount = useMemo(
    () => `${description.length}/${DESCRIPTION_MAX}`,
    [description.length]
  );

  // 退出页面前提示(避免编辑中误退出)——简化:不实现

  return (
    <View className={styles.page}>
      {showLoading ? (
        <View className={styles.center}>
          <Text className={styles.muted}>加载中...</Text>
        </View>
      ) : (
        <ScrollView scrollY className={styles.scroll}>
          {/* ====== 1. 标题 ====== */}
          <View className={styles.field}>
            <View className={styles.fieldHeader}>
              <Text className={styles.label}>
                标题 <Text className={styles.required}>*</Text>
              </Text>
              <Text className={styles.count}>{titleCount}</Text>
            </View>
            <Input
              value={title}
              onChange={setTitle}
              placeholder="1-50 字符,如:陈氏太极拳晨练班"
              maxLength={TITLE_MAX}
              className={styles.input}
            />
          </View>

          {/* ====== 2. 标签搜索选择 ====== */}
          <View className={styles.field}>
            <View className={styles.fieldHeader}>
              <Text className={styles.label}>
                兴趣标签 <Text className={styles.required}>*</Text>
              </Text>
              <Text className={styles.count}>{tagsCountText}</Text>
            </View>
            <TagSelector
              selectedIds={tagIds}
              onChange={setTagIds}
              max={TAGS_MAX}
              selectedTags={selectedTags}
            />
          </View>

          {/* ====== 3. 描述 ====== */}
          <View className={styles.field}>
            <View className={styles.fieldHeader}>
              <Text className={styles.label}>
                圈子介绍 <Text className={styles.required}>*</Text>
              </Text>
              <Text className={styles.count}>{descCount}</Text>
            </View>
            <TextArea
              value={description}
              onChange={(v) => setDescription(v)}
              placeholder="1-500 字符,介绍圈子内容、目标人群等"
              maxLength={DESCRIPTION_MAX}
              rows={4}
              className={styles.textarea}
            />
          </View>

          {/* ====== 4. 活动地点 ====== */}
          <View className={styles.field}>
            <View className={styles.fieldHeader}>
              <Text className={styles.label}>
                活动地点 <Text className={styles.required}>*</Text>
              </Text>
            </View>
            <View className={styles.locationCard} onClick={handleChooseLocation}>
              <Text
                className={
                  address ? styles.locationText : styles.locationPlaceholder
                }
              >
                {address || '点击选择活动地点'}
              </Text>
              <Text className={styles.locationArrow}>选择 ›</Text>
            </View>
          </View>

          {/* ====== 5. 联系电话 ====== */}
          <View className={styles.field}>
            <View className={styles.fieldHeader}>
              <Text className={styles.label}>联系电话</Text>
            </View>
            <Input
              value={contactPhone}
              onChange={setContactPhone}
              placeholder="11 位手机号(与微信号至少填一个)"
              maxLength={11}
              type="number"
              className={styles.input}
            />
          </View>

          {/* ====== 6. 微信号 ====== */}
          <View className={styles.field}>
            <View className={styles.fieldHeader}>
              <Text className={styles.label}>微信号</Text>
            </View>
            <Input
              value={wechat}
              onChange={setWechat}
              placeholder="微信号(与联系电话至少填一个)"
              className={styles.input}
            />
          </View>

          {/* ====== 7. 活动时间 ====== */}
          <View className={styles.field}>
            <View className={styles.fieldHeader}>
              <Text className={styles.label}>活动时间</Text>
            </View>
            <Input
              value={activityTime}
              onChange={setActivityTime}
              placeholder="如:每周六上午 9:00-11:00"
              className={styles.input}
            />
          </View>

          {/* ====== 8. 人数上限 ====== */}
          <View className={styles.field}>
            <View className={styles.fieldHeader}>
              <Text className={styles.label}>人数上限</Text>
            </View>
            <Input
              value={maxMembers}
              onChange={setMaxMembers}
              placeholder={`可选,范围 ${MAX_MEMBERS_MIN}-${MAX_MEMBERS_MAX}`}
              type="number"
              className={styles.input}
            />
          </View>

          {/* 提示:非 TEACHER 升级 */}
          {user?.role !== 'TEACHER' && !isEdit && (
            <Text className={styles.upgradeHint}>
              提交后将自动升级为"传承人"身份
            </Text>
          )}
        </ScrollView>
      )}

      {/* ====== 底部固定提交按钮 ====== */}
      <View className={styles.footer}>
        <Button
          type="primary"
          shape="round"
          block
          size="large"
          loading={submitting}
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {isEdit ? '保存修改' : '创建圈子'}
        </Button>
        {formErr && <Text className={styles.footerErr}>{formErr}</Text>}
      </View>

      {/* ====== H5 端地图选点弹层 ====== */}
      {process.env.TARO_ENV === 'h5' && (
        <H5LocationPicker
          visible={pickerVisible}
          initialLat={latitude}
          initialLng={longitude}
          onConfirm={handlePickerConfirm}
          onClose={() => setPickerVisible(false)}
        />
      )}
    </View>
  );
};

export default CreateCirclePage;
