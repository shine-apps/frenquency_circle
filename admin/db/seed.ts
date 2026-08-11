import "dotenv/config"
import bcrypt from "bcryptjs"
import { pinyin } from "pinyin-pro"
import { inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  users,
  hobbyTags,
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
 * 标签定义(二级分类体系:category 一级大类 + name 二级分类名称)。
 * 由原 60 条三级标签按 (category, subCategory) 去重得到 25 条二级标签,
 * name 取原 subCategory。参考_PRD §4.2.4 兴趣标签体系表_。
 */
type TagDefinition = {
  name: string
  category: string
}

const TAG_DEFINITIONS: TagDefinition[] = [
  // === 武术养生 (3) ===
  { name: "太极拳", category: "武术养生" },
  { name: "气功功法", category: "武术养生" },
  { name: "器械功法", category: "武术养生" },

  // === 民族器乐 (4) ===
  { name: "弹拨乐器", category: "民族器乐" },
  { name: "拉弦乐器", category: "民族器乐" },
  { name: "吹管乐器", category: "民族器乐" },
  { name: "打击乐器", category: "民族器乐" },

  // === 书画篆刻 (3) ===
  { name: "书法", category: "书画篆刻" },
  { name: "国画", category: "书画篆刻" },
  { name: "篆刻", category: "书画篆刻" },

  // === 茶道花艺 (4) ===
  { name: "茶艺", category: "茶道花艺" },
  { name: "花道", category: "茶道花艺" },
  { name: "香道", category: "茶道花艺" },
  { name: "茶具", category: "茶道花艺" },

  // === 戏曲曲艺 (6) ===
  { name: "京剧", category: "戏曲曲艺" },
  { name: "昆曲", category: "戏曲曲艺" },
  { name: "越剧", category: "戏曲曲艺" },
  { name: "相声", category: "戏曲曲艺" },
  { name: "评书", category: "戏曲曲艺" },
  { name: "鼓曲", category: "戏曲曲艺" },

  // === 传统手工 (5) ===
  { name: "剪纸", category: "传统手工" },
  { name: "刺绣", category: "传统手工" },
  { name: "陶艺", category: "传统手工" },
  { name: "编织", category: "传统手工" },
  { name: "木作", category: "传统手工" },
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

  // === 2. 用户定义(标签名已从原三级映射为二级,如"陈氏太极拳养生八式"→"太极拳") ===
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
      tagNames: ["太极拳", "气功功法", "书法"],
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
      tagNames: ["太极拳", "气功功法"],
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
      tagNames: ["弹拨乐器"],
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
      tagNames: ["太极拳", "气功功法"],
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

  // === 6. 插入标签(幂等:先查现有,只插入不存在的) ===
  console.log("→ 插入兴趣标签…")
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
        const { pinyin: py, pinyinInitials: pyInit } = computePinyin(t.name)
        return {
          name: t.name,
          category: t.category,
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
    `✅ Seeded ${userSeeds.length} users, ${TAG_DEFINITIONS.length} tags, ${circleSeeds.length} circles.`
  )
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ Seed failed:", err)
  process.exit(1)
})
