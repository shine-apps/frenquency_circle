import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Input, Button, Tag } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { searchTags, getCategories, createCustomTag } from '@/services/tags';
import styles from './index.module.scss';

export interface TagSelectorProps {
  /** 已选标签 ID 列表 */
  selectedIds: string[];
  /** 已选 ID 变化回调 */
  onChange: (ids: string[]) => void;
  /** 最大可选数量,默认 10 */
  max?: number;
  /**
   * 可选:父组件传入已选的完整 TagDTO[]。
   * 传入时直接用于已选区展示;不传时组件内部用缓存策略
   * (搜索结果填充缓存,缓存未命中的 id 展示"未知标签")。
   */
  selectedTags?: TagDTO[];
}

/** 搜索防抖时长(ms) */
const DEBOUNCE_MS = 300;
/** 自定义标签名长度上限(与后端一致) */
const CUSTOM_NAME_MAX = 30;

/**
 * 兴趣标签选择器。
 *
 * 结构:顶部搜索框 + 联想列表 + 已选标签区 + 六大类分类骨架 + 自定义添加入口。
 *
 * 简化说明(spec 已允许):
 * - 后端 `GET /api/tags/search` 按标签名搜索,无"按 category 浏览"接口;
 *   故六大类仅展示分类树作为视觉骨架,点击类名只做展开/收起提示,
 *   用户主要通过搜索找标签。
 * - 已选 ID 若未传入 selectedTags 且未命中缓存,展示"未知标签"占位。
 */
const TagSelector: React.FC<TagSelectorProps> = ({
  selectedIds,
  onChange,
  max = 10,
  selectedTags,
}) => {
  // 搜索相关状态
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<TagDTO[]>([]);
  const [loading, setLoading] = useState(false);
  // 六大类分类树
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  // 当前展开的分类名(空表示全部收起)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // 自定义添加相关状态
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customSubmitting, setCustomSubmitting] = useState(false);

  // 标签缓存:id -> TagDTO,用于已选区展示
  const cacheRef = useRef<Map<string, TagDTO>>(new Map());

  // 防抖定时器引用
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ====== 已选区展示数据 ======
  // 优先用父组件传入的 selectedTags,其次用缓存,最后占位"未知标签"
  const selectedTagList: TagDTO[] = useMemo(() => {
    if (selectedTags && selectedTags.length > 0) {
      // 同步写入缓存
      selectedTags.forEach((t) => cacheRef.current.set(t.id, t));
      return selectedTags;
    }
    return selectedIds.map((id) => {
      const cached = cacheRef.current.get(id);
      if (cached) return cached;
      // 占位:未知标签
      return {
        id,
        name: '未知标签',
        category: '',
        status: 'pending',
      };
    });
  }, [selectedIds, selectedTags]);

  const reachedMax = selectedIds.length >= max;

  // ====== 拉取分类树(仅 mount 一次) ======
  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((res) => {
        if (!cancelled) setCategories(res.categories || []);
      })
      .catch(() => {
        // 拉取失败不阻塞,分类区静默不展示
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ====== 防抖搜索 ======
  const runSearch = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const res = await searchTags(q, 20);
        const list = res.list || [];
        setSuggestions(list);
        // 把搜索结果写入缓存,便于后续已选区展示
        list.forEach((t) => cacheRef.current.set(t.id, t));
      } catch (e) {
        // 搜索失败静默处理,不弹 toast 避免干扰输入
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // ====== 选择 / 取消选择 ======
  const handleToggleTag = (tag: TagDTO): void => {
    if (selectedIds.includes(tag.id)) {
      onChange(selectedIds.filter((id) => id !== tag.id));
    } else {
      if (reachedMax) {
        Taro.showToast({ title: `最多选 ${max} 个`, icon: 'none' });
        return;
      }
      cacheRef.current.set(tag.id, tag);
      onChange([...selectedIds, tag.id]);
    }
  };

  const handleRemoveSelected = (id: string): void => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  // ====== 分类展开/收起 ======
  const handleToggleCategory = (cat: string): void => {
    setExpandedCategory((prev) => (prev === cat ? null : cat));
  };

  // ====== 自定义添加 ======
  const handleCustomNameChange = (val: string): void => {
    setCustomName(val.slice(0, CUSTOM_NAME_MAX));
  };

  const handleSubmitCustom = async (): Promise<void> => {
    const name = customName.trim();
    if (!name) {
      Taro.showToast({ title: '请输入标签名', icon: 'none' });
      return;
    }
    if (selectedIds.length >= max) {
      Taro.showToast({ title: `最多选 ${max} 个`, icon: 'none' });
      return;
    }
    setCustomSubmitting(true);
    try {
      const tag = await createCustomTag(name);
      cacheRef.current.set(tag.id, tag);
      onChange([...selectedIds, tag.id]);
      setCustomName('');
      setCustomOpen(false);
      Taro.showToast({ title: '已添加', icon: 'success' });
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || '创建失败', icon: 'none' });
    } finally {
      setCustomSubmitting(false);
    }
  };

  return (
    <View className={styles.container}>
      {/* ====== 1. 搜索框 ====== */}
      <View className={styles.searchRow}>
        <Input
          value={query}
          onChange={setQuery}
          placeholder="搜索兴趣/标签(支持拼音)"
          clearable
          className={styles.searchInput}
        />
        {loading && <Text className={styles.searchHint}>搜索中...</Text>}
      </View>

      {/* ====== 2. 已选标签区 ====== */}
      {selectedTagList.length > 0 && (
        <View className={styles.selectedWrap}>
          <View className={styles.selectedHeader}>
            <Text className={styles.selectedTitle}>
              已选({selectedTagList.length}/{max})
            </Text>
          </View>
          <ScrollView scrollX className={styles.selectedScroll}>
            <View className={styles.chips}>
              {selectedTagList.map((tag) => (
                <View key={tag.id} className={styles.chipItem}>
                  <Tag
                    type="primary"
                    closable
                    onClose={() => handleRemoveSelected(tag.id)}
                  >
                    {tag.name}
                  </Tag>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ====== 3. 主体区:搜索非空展示联想列表,否则展示分类骨架 ====== */}
      {query.trim() ? (
        <View className={styles.suggestWrap}>
          {suggestions.length === 0 && !loading && (
            <View className={styles.empty}>
              <Text className={styles.emptyText}>
                未找到"{query.trim()}"相关标签,试试自定义添加
              </Text>
            </View>
          )}
          {suggestions.map((tag) => {
            const active = selectedIds.includes(tag.id);
            return (
              <View
                key={tag.id}
                className={`${styles.suggestItem} ${active ? styles.suggestItemActive : ''}`}
                onClick={() => !active && handleToggleTag(tag)}
              >
                <View className={styles.suggestInfo}>
                  <Text className={styles.suggestName}>{tag.name}</Text>
                  {tag.category && (
                    <Text className={styles.suggestCat}>{tag.category}</Text>
                  )}
                </View>
                <Text className={active ? styles.suggestAdded : styles.suggestAdd}>
                  {active ? '已选' : reachedMax ? `上限${max}` : '选择'}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View className={styles.categoryWrap}>
          <View className={styles.sectionTitle}>
            <Text className={styles.sectionTitleText}>六大类兴趣</Text>
            <Text className={styles.sectionTitleHint}>点击搜索框查找标签</Text>
          </View>
          {categories.length === 0 && (
            <View className={styles.empty}>
              <Text className={styles.emptyText}>分类加载中...</Text>
            </View>
          )}
          {categories.map((node) => {
            const expanded = expandedCategory === node.category;
            return (
              <View key={node.category} className={styles.categoryItem}>
                <View
                  className={styles.categoryHeader}
                  onClick={() => handleToggleCategory(node.category)}
                >
                  <Text className={styles.categoryName}>{node.category}</Text>
                  <Text className={styles.categoryArrow}>
                    {expanded ? '收起' : '展开'}
                  </Text>
                </View>
                {expanded && node.subCategories.length > 0 && (
                  <View className={styles.subCategories}>
                    {node.subCategories.map((sub) => (
                      <Text key={sub} className={styles.subCategory}>
                        {sub}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* ====== 4. 自定义添加入口 ====== */}
      <View className={styles.customWrap}>
        <View
          className={styles.customToggle}
          onClick={() => setCustomOpen((v) => !v)}
        >
          <Text className={styles.customToggleText}>
            {customOpen ? '收起自定义' : '自定义添加'}
          </Text>
          <Text className={styles.customToggleHint}>
            没找到?创建一个新标签
          </Text>
        </View>
        {customOpen && (
          <View className={styles.customForm}>
            <View className={styles.customInputWrap}>
              <Input
                value={customName}
                onChange={handleCustomNameChange}
                placeholder="输入标签名(1-30 字)"
                maxLength={CUSTOM_NAME_MAX}
                className={styles.customInput}
              />
            </View>
            <Button
              type="primary"
              size="small"
              loading={customSubmitting}
              disabled={!customName.trim()}
              onClick={handleSubmitCustom}
            >
              添加
            </Button>
          </View>
        )}
      </View>
    </View>
  );
};

export default TagSelector;
