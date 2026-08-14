import "dotenv/config"
import bcrypt from "bcryptjs"
import { pinyin } from "pinyin-pro"
import { eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  users,
  hobbyTags,
  categories,
  circles,
  circleMembers,
  accounts,
  type UserRole,
  type ActivityLevel,
} from "@/db/schema"

/**
 * 计算标签的拼音全拼与首字母。
 * - 全拼:无声调连写,如 "太极拳" → "taijiquan"
 * - 首字母:如 "太极拳" → "tjq"
 */
function computePinyin(name: string): { pinyin: string; pinyinInitials: string } {
  const full = pinyin(name, { toneType: "none", type: "array" }).join("")
  const initials = pinyin(name, {
    pattern: "first",
    toneType: "none",
    type: "array",
  }).join("")
  return { pinyin: full, pinyinInitials: initials }
}

/**
 * 分类树定义(两级:一级大类 → 二级中类)。
 * 用 slug 作为稳定键,标签通过 subCategorySlug 关联到具体二级中类节点,
 * 避免分类名称漂移导致关联失败。
 */
type CategorySeed = {
  /** 一级大类定义 */
  slug: string
  name: string
  sortOrder: number
  /** 该大类下的二级中类 */
  subCategories: { slug: string; name: string; sortOrder: number }[]
}

const CATEGORY_TREE: CategorySeed[] = [
  {
    slug: "visual-arts",
    name: "视觉艺术",
    sortOrder: 1,
    subCategories: [
      { slug: "calligraphy", name: "书画篆刻", sortOrder: 1 },
      { slug: "painting", name: "绘画雕塑", sortOrder: 2 },
      { slug: "digital-paint", name: "数字绘画", sortOrder: 3 },
    ],
  },
  {
    slug: "performing-arts",
    name: "表演艺术",
    sortOrder: 2,
    subCategories: [
      { slug: "folk-instrument", name: "民族器乐", sortOrder: 1 },
      { slug: "western-instrument", name: "西洋乐器", sortOrder: 2 },
      { slug: "opera-quyi", name: "戏曲曲艺", sortOrder: 3 },
      { slug: "dance-drama", name: "舞蹈戏剧", sortOrder: 4 },
    ],
  },
  {
    slug: "crafts",
    name: "传统工艺",
    sortOrder: 3,
    subCategories: [
      { slug: "handcraft", name: "手工技艺", sortOrder: 1 },
      { slug: "ceramics", name: "陶瓷塑造", sortOrder: 2 },
    ],
  },
  {
    slug: "lifestyle",
    name: "生活美学",
    sortOrder: 4,
    subCategories: [
      { slug: "tea-flower", name: "茶道花艺", sortOrder: 1 },
      { slug: "drink-craft", name: "饮品手作", sortOrder: 2 },
      { slug: "garden-fragrance", name: "园艺香氛", sortOrder: 3 },
    ],
  },
  {
    slug: "martial-wellness",
    name: "武术养生",
    sortOrder: 5,
    subCategories: [
      { slug: "fitness-qigong", name: "健身气功", sortOrder: 1 },
      { slug: "taiji", name: "太极拳", sortOrder: 2 },
      { slug: "other-wushu", name: "其他传统武术", sortOrder: 3 },
    ],
  },
  {
    slug: "digital-media",
    name: "数字新媒体",
    sortOrder: 6,
    subCategories: [{ slug: "media-audio", name: "影像音频", sortOrder: 1 }],
  },
]

/**
 * 标签定义(叶子节点)。
 * 通过 subCategorySlug 关联到 CATEGORY_TREE 中的二级中类节点(categoryId 外键)。
 */
type TagDefinition = {
  /** 具体标签名称(如"太极拳""书法") */
  name: string
  /** 所属二级中类的 slug(指向 CATEGORY_TREE 中的 subCategories[].slug) */
  subCategorySlug: string
}

const TAG_DEFINITIONS: TagDefinition[] = [
  // === 武术养生 → 健身气功 ===
  { name: "八段锦", subCategorySlug: "fitness-qigong" },
  { name: "五禽戏", subCategorySlug: "fitness-qigong" },
  { name: "易筋经", subCategorySlug: "fitness-qigong" },
  { name: "六字诀", subCategorySlug: "fitness-qigong" },

  // === 武术养生 → 太极拳(具体流派) ===
  { name: "太极拳", subCategorySlug: "taiji" },
  { name: "陈式太极拳", subCategorySlug: "taiji" },
  { name: "杨式太极拳", subCategorySlug: "taiji" },
  { name: "武式太极拳", subCategorySlug: "taiji" },
  { name: "吴式太极拳", subCategorySlug: "taiji" },
  { name: "孙式太极拳", subCategorySlug: "taiji" },
  { name: "和式太极拳", subCategorySlug: "taiji" },

  // === 武术养生 → 其他传统武术(具体拳种) ===
  { name: "少林拳", subCategorySlug: "other-wushu" },
  { name: "咏春", subCategorySlug: "other-wushu" },
  { name: "形意拳", subCategorySlug: "other-wushu" },
  { name: "八卦掌", subCategorySlug: "other-wushu" },
  { name: "南拳", subCategorySlug: "other-wushu" },
  { name: "长拳", subCategorySlug: "other-wushu" },

  // === 视觉艺术 → 书画篆刻 ===
  { name: "书法", subCategorySlug: "calligraphy" },
  { name: "楷书", subCategorySlug: "calligraphy" },
  { name: "行书", subCategorySlug: "calligraphy" },
  { name: "硬笔书法", subCategorySlug: "calligraphy" },
  { name: "国画", subCategorySlug: "calligraphy" },
  { name: "篆刻", subCategorySlug: "calligraphy" },

  // === 视觉艺术 → 绘画雕塑 ===
  { name: "油画", subCategorySlug: "painting" },
  { name: "水彩", subCategorySlug: "painting" },
  { name: "素描", subCategorySlug: "painting" },
  { name: "速写", subCategorySlug: "painting" },
  { name: "雕塑", subCategorySlug: "painting" },
  { name: "版画", subCategorySlug: "painting" },
  { name: "插画", subCategorySlug: "painting" },
  { name: "漫画", subCategorySlug: "painting" },

  // === 视觉艺术 → 数字绘画 ===
  { name: "板绘", subCategorySlug: "digital-paint" },
  { name: "像素画", subCategorySlug: "digital-paint" },
  { name: "AI绘画", subCategorySlug: "digital-paint" },

  // === 传统工艺 → 手工技艺 ===
  { name: "剪纸", subCategorySlug: "handcraft" },
  { name: "刺绣", subCategorySlug: "handcraft" },
  { name: "编织", subCategorySlug: "handcraft" },
  { name: "木作", subCategorySlug: "handcraft" },
  { name: "扎染", subCategorySlug: "handcraft" },
  { name: "皮具", subCategorySlug: "handcraft" },
  { name: "面塑", subCategorySlug: "handcraft" },

  // === 传统工艺 → 陶瓷塑造 ===
  { name: "陶艺", subCategorySlug: "ceramics" },
  { name: "紫砂", subCategorySlug: "ceramics" },
  { name: "青花瓷", subCategorySlug: "ceramics" },
  { name: "建盏", subCategorySlug: "ceramics" },

  // === 表演艺术 → 民族器乐(具体乐器) ===
  { name: "古琴", subCategorySlug: "folk-instrument" },
  { name: "古筝", subCategorySlug: "folk-instrument" },
  { name: "琵琶", subCategorySlug: "folk-instrument" },
  { name: "阮", subCategorySlug: "folk-instrument" },
  { name: "月琴", subCategorySlug: "folk-instrument" },
  { name: "二胡", subCategorySlug: "folk-instrument" },
  { name: "板胡", subCategorySlug: "folk-instrument" },
  { name: "京胡", subCategorySlug: "folk-instrument" },
  { name: "马头琴", subCategorySlug: "folk-instrument" },
  { name: "笛子", subCategorySlug: "folk-instrument" },
  { name: "箫", subCategorySlug: "folk-instrument" },
  { name: "唢呐", subCategorySlug: "folk-instrument" },
  { name: "葫芦丝", subCategorySlug: "folk-instrument" },
  { name: "笙", subCategorySlug: "folk-instrument" },
  { name: "埙", subCategorySlug: "folk-instrument" },
  { name: "扬琴", subCategorySlug: "folk-instrument" },

  // === 表演艺术 → 西洋乐器 ===
  { name: "钢琴", subCategorySlug: "western-instrument" },
  { name: "小提琴", subCategorySlug: "western-instrument" },
  { name: "大提琴", subCategorySlug: "western-instrument" },
  { name: "吉他", subCategorySlug: "western-instrument" },
  { name: "尤克里里", subCategorySlug: "western-instrument" },
  { name: "架子鼓", subCategorySlug: "western-instrument" },
  { name: "长笛", subCategorySlug: "western-instrument" },
  { name: "萨克斯", subCategorySlug: "western-instrument" },
  { name: "手风琴", subCategorySlug: "western-instrument" },

  // === 表演艺术 → 戏曲曲艺 ===
  { name: "京剧", subCategorySlug: "opera-quyi" },
  { name: "昆曲", subCategorySlug: "opera-quyi" },
  { name: "越剧", subCategorySlug: "opera-quyi" },
  { name: "黄梅戏", subCategorySlug: "opera-quyi" },
  { name: "豫剧", subCategorySlug: "opera-quyi" },
  { name: "川剧", subCategorySlug: "opera-quyi" },
  { name: "相声", subCategorySlug: "opera-quyi" },
  { name: "评书", subCategorySlug: "opera-quyi" },
  { name: "评弹", subCategorySlug: "opera-quyi" },
  { name: "鼓曲", subCategorySlug: "opera-quyi" },
  { name: "快板", subCategorySlug: "opera-quyi" },

  // === 表演艺术 → 舞蹈戏剧 ===
  { name: "芭蕾", subCategorySlug: "dance-drama" },
  { name: "现代舞", subCategorySlug: "dance-drama" },
  { name: "民族民间舞", subCategorySlug: "dance-drama" },
  { name: "古典舞", subCategorySlug: "dance-drama" },
  { name: "街舞", subCategorySlug: "dance-drama" },
  { name: "拉丁舞", subCategorySlug: "dance-drama" },
  { name: "话剧", subCategorySlug: "dance-drama" },
  { name: "音乐剧", subCategorySlug: "dance-drama" },

  // === 生活美学 → 茶道花艺 ===
  { name: "茶艺", subCategorySlug: "tea-flower" },
  { name: "工夫茶", subCategorySlug: "tea-flower" },
  { name: "花道", subCategorySlug: "tea-flower" },
  { name: "中式插花", subCategorySlug: "tea-flower" },
  { name: "香道", subCategorySlug: "tea-flower" },
  { name: "茶具", subCategorySlug: "tea-flower" },

  // === 生活美学 → 饮品手作 ===
  { name: "咖啡", subCategorySlug: "drink-craft" },
  { name: "手冲咖啡", subCategorySlug: "drink-craft" },
  { name: "调酒", subCategorySlug: "drink-craft" },
  { name: "精酿", subCategorySlug: "drink-craft" },
  { name: "烘焙", subCategorySlug: "drink-craft" },
  { name: "奶茶", subCategorySlug: "drink-craft" },

  // === 生活美学 → 园艺香氛 ===
  { name: "园艺", subCategorySlug: "garden-fragrance" },
  { name: "多肉", subCategorySlug: "garden-fragrance" },
  { name: "盆景", subCategorySlug: "garden-fragrance" },
  { name: "香薰", subCategorySlug: "garden-fragrance" },
  { name: "香水", subCategorySlug: "garden-fragrance" },
  { name: "香薰蜡烛", subCategorySlug: "garden-fragrance" },

  // === 数字新媒体 → 影像音频 ===
  { name: "视频剪辑", subCategorySlug: "media-audio" },
  { name: "电子音乐", subCategorySlug: "media-audio" },
  { name: "Vlog", subCategorySlug: "media-audio" },
  { name: "摄影", subCategorySlug: "media-audio" },
  { name: "播客", subCategorySlug: "media-audio" },
  { name: "配音", subCategorySlug: "media-audio" },
]

/**
 * 用户定义(保留现有 admin 与 user,新增 2 个 TEACHER 与 3 个 USER)。
 * tagNames 为该用户绑定的二级标签名(直接写入 users.tags 数组)。
 */
type UserSeed = {
  email: string
  name: string
  passwordHash: string
  role: UserRole
  phone?: string
  practiceYears?: number
  activityLevel?: ActivityLevel
  latitude?: number
  longitude?: number
  address?: string
  /** 该用户绑定的二级标签名称列表(直接写入 users.tags) */
  tagNames?: string[]
}

/**
 * 圈子定义。
 */
type CircleSeed = {
  title: string
  description: string
  creatorEmail: string
  latitude: number
  longitude: number
  address: string
  contactPhone?: string
  wechat?: string
  activityTime?: string
  maxMembers?: number
  tagNames: string[]
}

async function main() {
  console.log("🌱 Seeding database…")

  // === 1. 哈希密码 ===
  const adminHash = await bcrypt.hash("admin123", 10)
  const userHash = await bcrypt.hash("user123", 10)
  const teacherHash = await bcrypt.hash("teacher123", 10)

  // === 2. 用户定义(标签名为三级体系的具体标签名,如"太极拳""书法",直接写入 users.tags 数组) ===
  const userSeeds: UserSeed[] = [
    // 保留现有 admin 与测试用户
    {
      email: "admin@example.com",
      name: "Admin User",
      passwordHash: adminHash,
      role: "ADMIN",
    },
    {
      email: "user@example.com",
      name: "Regular User",
      passwordHash: userHash,
      role: "USER",
    },
    // 新增 2 个 TEACHER 用户
    {
      email: "wangshifu@example.com",
      name: "王师傅",
      passwordHash: teacherHash,
      role: "TEACHER",
      phone: "13800000001",
      practiceYears: 20,
      activityLevel: "high",
      latitude: 39.94,
      longitude: 116.49,
      address: "北京市朝阳区朝阳公园南路1号",
      tagNames: ["陈式太极拳", "八段锦", "书法"],
    },
    {
      email: "lilaoshi@example.com",
      name: "李老师",
      passwordHash: teacherHash,
      role: "TEACHER",
      phone: "13800000002",
      practiceYears: 15,
      activityLevel: "high",
      latitude: 39.96,
      longitude: 116.32,
      address: "北京市海淀区中关村大街1号",
      tagNames: ["书法", "国画"],
    },
    // 新增 3 个 USER 用户(爱好者)
    {
      email: "zhangtongxue@example.com",
      name: "张同学",
      passwordHash: userHash,
      role: "USER",
      phone: "13900000001",
      activityLevel: "medium",
      latitude: 39.93,
      longitude: 116.47,
      address: "北京市朝阳区团结湖路",
      tagNames: ["陈式太极拳", "八段锦"],
    },
    {
      email: "chentongxue@example.com",
      name: "陈同学",
      passwordHash: userHash,
      role: "USER",
      phone: "13900000002",
      activityLevel: "medium",
      latitude: 39.95,
      longitude: 116.35,
      address: "北京市海淀区学院路",
      tagNames: ["书法"],
    },
    {
      email: "lintongxue@example.com",
      name: "林同学",
      passwordHash: userHash,
      role: "USER",
      phone: "13900000003",
      activityLevel: "low",
      latitude: 39.92,
      longitude: 116.45,
      address: "北京市朝阳区建国门外大街",
      tagNames: ["琵琶"],
    },
  ]

  // === 3. 圈子定义(均为王师傅创建,标签为二级名称) ===
  const circleSeeds: CircleSeed[] = [
    {
      title: "朝阳公园陈氏太极拳晨练班",
      description:
        "每周六、日早晨 7:00-8:30 在朝阳公园南门广场练习陈氏太极拳养生八式与老架一路,适合各年龄段爱好者加入。由陈氏太极拳第十二代传人王师傅亲自授课,二十年教学经验。",
      creatorEmail: "wangshifu@example.com",
      latitude: 39.94,
      longitude: 116.49,
      address: "北京市朝阳区朝阳公园南路1号",
      contactPhone: "13800000001",
      wechat: "wangshifu_taiji",
      activityTime: "每周六、日 07:00-08:30",
      maxMembers: 20,
      tagNames: ["陈式太极拳", "八段锦"],
    },
    {
      title: "同频书法交流圈",
      description:
        "书法爱好者交流圈,定期组织颜体楷书与兰亭序行书临摹活动。欢迎零基础学员,提供文房四宝。每月组织一次作品点评与交流茶会。",
      creatorEmail: "wangshifu@example.com",
      latitude: 39.935,
      longitude: 116.485,
      address: "北京市朝阳区朝阳公园西路",
      contactPhone: "13800000001",
      wechat: "wangshifu_taiji",
      activityTime: "每周三 19:00-21:00",
      maxMembers: 15,
      tagNames: ["书法"],
    },
  ]

  // === 4. 插入用户(幂等:email 冲突时跳过,tags 直接写入数组列) ===
  console.log("→ 插入用户…")
  await Promise.all(
    userSeeds.map((u) =>
      db
        .insert(users)
        .values({
          email: u.email,
          name: u.name,
          passwordHash: u.passwordHash,
          role: u.role,
          phone: u.phone,
          practiceYears: u.practiceYears,
          activityLevel: u.activityLevel,
          latitude: u.latitude,
          longitude: u.longitude,
          address: u.address,
          tags: u.tagNames ?? [],
        })
        .onConflictDoNothing({ target: users.email })
    )
  )

  // === 5. 查询所有用户(获取 ID 映射) ===
  const userEmails = userSeeds.map((u) => u.email)
  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(inArray(users.email, userEmails))
  const userByEmail = new Map(userRows.map((r) => [r.email, r]))

  // === 5.1 绑定 credentials 账号(幂等 upsert) ===
  // 登录查找走 accounts 表(provider + providerAccountId),seed 仅插入 users 不够,
  // 必须在 accounts 中插入 (provider='credentials', providerAccountId=email) 才能登录。
  console.log("→ 绑定 credentials 账号…")
  for (const u of userSeeds) {
    const userRow = userByEmail.get(u.email)
    if (!userRow) continue
    await db
      .insert(accounts)
      .values({
        userId: userRow.id,
        provider: "credentials",
        providerAccountId: u.email,
        type: "credentials",
      })
      .onConflictDoUpdate({
        target: [accounts.provider, accounts.providerAccountId],
        set: { updatedAt: new Date() },
      })
  }

  // === 0. 全量重建分类与标签(清掉旧数据,保证分类结构干净) ===
  // 本次对分类树做了全新 slug 重组,旧分类/标签已无对应 slug,若不清理会沦为孤儿行。
  // 注意 hobby_tags.category_id 对 categories 为 onDelete: restrict,故必须先删标签、再删分类。
  // users.tags / circles.tags 为独立 text[] 数组(按标签名引用),重建后同名标签仍存在,
  // 不会丢失用户/圈子的兴趣关联。仅在需要重置分类结构时执行,生产环境请谨慎。
  console.log("→ 清理旧分类与标签(全量重建)…")
  await db.delete(hobbyTags)
  await db.delete(categories)

  // === 6. 插入分类树(幂等:按 slug upsert,保证 categoryId 关联稳定) ===
  console.log("→ 插入分类树…")
  for (const cat of CATEGORY_TREE) {
    await db
      .insert(categories)
      .values({
        slug: cat.slug,
        name: cat.name,
        level: 1,
        parentId: null,
        sortOrder: cat.sortOrder,
      })
      .onConflictDoUpdate({
        target: categories.slug,
        set: { name: cat.name, sortOrder: cat.sortOrder },
      })
    const parent = await db.query.categories.findFirst({
      where: eq(categories.slug, cat.slug),
    })
    if (!parent) continue
    for (const sub of cat.subCategories) {
      await db
        .insert(categories)
        .values({
          slug: sub.slug,
          name: sub.name,
          level: 2,
          parentId: parent.id,
          sortOrder: sub.sortOrder,
        })
        .onConflictDoUpdate({
          target: categories.slug,
          set: { name: sub.name, parentId: parent.id, sortOrder: sub.sortOrder },
        })
    }
  }

  // === 6.1 插入标签(幂等:先查现有,只插入不存在的,通过 slug 关联 categoryId) ===
  console.log("→ 插入兴趣标签…")
  // 构建 slug → categoryId(二级中类) 映射
  const allSubSlugs = CATEGORY_TREE.flatMap((c) =>
    c.subCategories.map((s) => s.slug)
  )
  const subCategoryRows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(inArray(categories.slug, allSubSlugs))
  const subCategoryIdBySlug = new Map(
    subCategoryRows.map((r) => [r.slug, r.id])
  )

  const allTagNames = TAG_DEFINITIONS.map((t) => t.name)
  const existingTags = await db
    .select({ id: hobbyTags.id, name: hobbyTags.name })
    .from(hobbyTags)
    .where(inArray(hobbyTags.name, allTagNames))
  const existingTagNames = new Set(existingTags.map((t) => t.name))

  const newTagDefs = TAG_DEFINITIONS.filter(
    (t) => !existingTagNames.has(t.name)
  )
  if (newTagDefs.length > 0) {
    await db.insert(hobbyTags).values(
      newTagDefs.map((t) => {
        const subId = subCategoryIdBySlug.get(t.subCategorySlug)
        if (!subId) {
          throw new Error(`标签 "${t.name}" 关联的二级中类 slug 不存在: ${t.subCategorySlug}`)
        }
        const { pinyin: py, pinyinInitials: pyInit } = computePinyin(t.name)
        return {
          name: t.name,
          categoryId: subId,
          pinyin: py,
          pinyinInitials: pyInit,
          status: "approved" as const,
        }
      })
    )
  }

  // === 7. 插入圈子(幂等:按 title 查询现有,只插入不存在的,tags 直接写数组列) ===
  console.log("→ 插入圈子…")
  const circleTitles = circleSeeds.map((c) => c.title)
  const existingCircles = await db
    .select({ id: circles.id, title: circles.title })
    .from(circles)
    .where(inArray(circles.title, circleTitles))
  const existingCircleTitles = new Set(existingCircles.map((c) => c.title))

  const newCircleDefs = circleSeeds.filter(
    (c) => !existingCircleTitles.has(c.title)
  )
  for (const c of newCircleDefs) {
    const creator = userByEmail.get(c.creatorEmail)
    if (!creator) {
      console.warn(`⚠️  未找到圈子创建者: ${c.creatorEmail},跳过`)
      continue
    }
    await db.insert(circles).values({
      title: c.title,
      description: c.description,
      creatorId: creator.id,
      latitude: c.latitude,
      longitude: c.longitude,
      address: c.address,
      contactPhone: c.contactPhone,
      wechat: c.wechat,
      activityTime: c.activityTime,
      maxMembers: c.maxMembers,
      status: "active",
      tags: c.tagNames,
    })
  }

  // === 8. 查询所有圈子(获取 ID 映射) ===
  const allCircles = await db
    .select({
      id: circles.id,
      title: circles.title,
      creatorId: circles.creatorId,
    })
    .from(circles)
    .where(inArray(circles.title, circleTitles))
  const circleByTitle = new Map(allCircles.map((c) => [c.title, c]))

  // === 9. 插入 circle_members(创建者自动作为 creator 成员,幂等) ===
  console.log("→ 插入圈子成员(创建者)…")
  const circleMemberRows: {
    circleId: string
    userId: string
    role: "creator"
  }[] = []
  for (const c of circleSeeds) {
    const circleRow = circleByTitle.get(c.title)
    if (!circleRow) continue
    const creator = userByEmail.get(c.creatorEmail)
    if (!creator) continue
    circleMemberRows.push({
      circleId: circleRow.id,
      userId: creator.id,
      role: "creator",
    })
  }
  if (circleMemberRows.length > 0) {
    await db
      .insert(circleMembers)
      .values(circleMemberRows)
      .onConflictDoNothing({
        target: [circleMembers.circleId, circleMembers.userId],
      })
  }

  console.log(
    `✅ Seeded ${userSeeds.length} users, ${TAG_DEFINITIONS.length} tag definitions, ${circleSeeds.length} circles.`
  )
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ Seed failed:", err)
  process.exit(1)
})
