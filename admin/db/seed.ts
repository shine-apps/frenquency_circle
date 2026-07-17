import "dotenv/config"
import bcrypt from "bcryptjs"
import { pinyin } from "pinyin-pro"
import { inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  users,
  tags,
  userTags,
  circles,
  circleTags,
  circleMembers,
  accounts,
  type UserRole,
  type ActivityLevel,
} from "@/db/schema"

/**
 * 计算标签的拼音全拼与首字母。
 * - 全拼:无声调连写,如 "陈氏太极拳" → "chenshitaijiquan"
 * - 首字母:如 "陈氏太极拳" → "cstjq"
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
 * 标签定义(category 一级大类,subCategory 二级分类,name 三级具体项目)。
 * 参考_PRD §4.2.4 兴趣标签体系表_与_§4.5 兴趣类别覆盖_。
 * 六大类各 10 条,共 60 条;全部 status='approved'。
 */
type TagDefinition = {
  name: string
  category: string
  subCategory: string
}

const TAG_DEFINITIONS: TagDefinition[] = [
  // === 武术养生 (10) ===
  { name: "陈氏太极拳养生八式", category: "武术养生", subCategory: "太极拳" },
  { name: "杨氏太极拳85式", category: "武术养生", subCategory: "太极拳" },
  { name: "吴氏太极拳", category: "武术养生", subCategory: "太极拳" },
  { name: "孙氏太极拳", category: "武术养生", subCategory: "太极拳" },
  { name: "陈氏太极拳老架一路", category: "武术养生", subCategory: "太极拳" },
  { name: "八段锦", category: "武术养生", subCategory: "气功功法" },
  { name: "五禽戏", category: "武术养生", subCategory: "气功功法" },
  { name: "易筋经", category: "武术养生", subCategory: "气功功法" },
  { name: "六字诀", category: "武术养生", subCategory: "气功功法" },
  { name: "太极剑", category: "武术养生", subCategory: "器械功法" },

  // === 民族器乐 (10) ===
  { name: "古筝", category: "民族器乐", subCategory: "弹拨乐器" },
  { name: "琵琶", category: "民族器乐", subCategory: "弹拨乐器" },
  { name: "古琴", category: "民族器乐", subCategory: "弹拨乐器" },
  { name: "二胡", category: "民族器乐", subCategory: "拉弦乐器" },
  { name: "京胡", category: "民族器乐", subCategory: "拉弦乐器" },
  { name: "马头琴", category: "民族器乐", subCategory: "拉弦乐器" },
  { name: "笛子", category: "民族器乐", subCategory: "吹管乐器" },
  { name: "葫芦丝", category: "民族器乐", subCategory: "吹管乐器" },
  { name: "洞箫", category: "民族器乐", subCategory: "吹管乐器" },
  { name: "堂鼓", category: "民族器乐", subCategory: "打击乐器" },

  // === 书画篆刻 (10) ===
  { name: "颜体楷书临摹", category: "书画篆刻", subCategory: "书法" },
  { name: "兰亭序行书", category: "书画篆刻", subCategory: "书法" },
  { name: "曹全碑隶书", category: "书画篆刻", subCategory: "书法" },
  { name: "峄山碑篆书", category: "书画篆刻", subCategory: "书法" },
  { name: "工笔花鸟", category: "书画篆刻", subCategory: "国画" },
  { name: "写意山水", category: "书画篆刻", subCategory: "国画" },
  { name: "水墨人物", category: "书画篆刻", subCategory: "国画" },
  { name: "青绿山水", category: "书画篆刻", subCategory: "国画" },
  { name: "汉印临摹", category: "书画篆刻", subCategory: "篆刻" },
  { name: "元朱文篆刻", category: "书画篆刻", subCategory: "篆刻" },

  // === 茶道花艺 (10) ===
  { name: "工夫茶冲泡", category: "茶道花艺", subCategory: "茶艺" },
  { name: "宋代点茶", category: "茶道花艺", subCategory: "茶艺" },
  { name: "普洱茶品鉴", category: "茶道花艺", subCategory: "茶艺" },
  { name: "白茶冲泡", category: "茶道花艺", subCategory: "茶艺" },
  { name: "传统插花", category: "茶道花艺", subCategory: "花道" },
  { name: "池坊花道", category: "茶道花艺", subCategory: "花道" },
  { name: "隔火熏香", category: "茶道花艺", subCategory: "香道" },
  { name: "篆香打拓", category: "茶道花艺", subCategory: "香道" },
  { name: "紫砂壶", category: "茶道花艺", subCategory: "茶具" },
  { name: "建盏", category: "茶道花艺", subCategory: "茶具" },

  // === 戏曲曲艺 (10) ===
  { name: "梅派唱腔", category: "戏曲曲艺", subCategory: "京剧" },
  { name: "程派水袖", category: "戏曲曲艺", subCategory: "京剧" },
  { name: "老生唱腔", category: "戏曲曲艺", subCategory: "京剧" },
  { name: "花脸脸谱绘制", category: "戏曲曲艺", subCategory: "京剧" },
  { name: "牡丹亭游园", category: "戏曲曲艺", subCategory: "昆曲" },
  { name: "长生殿", category: "戏曲曲艺", subCategory: "昆曲" },
  { name: "越剧红楼梦", category: "戏曲曲艺", subCategory: "越剧" },
  { name: "传统相声", category: "戏曲曲艺", subCategory: "相声" },
  { name: "三国评书", category: "戏曲曲艺", subCategory: "评书" },
  { name: "京韵大鼓", category: "戏曲曲艺", subCategory: "鼓曲" },

  // === 传统手工 (10) ===
  { name: "陕北剪纸", category: "传统手工", subCategory: "剪纸" },
  { name: "团花剪纸", category: "传统手工", subCategory: "剪纸" },
  { name: "苏绣", category: "传统手工", subCategory: "刺绣" },
  { name: "蜀绣", category: "传统手工", subCategory: "刺绣" },
  { name: "拉坯成型", category: "传统手工", subCategory: "陶艺" },
  { name: "釉下彩绘", category: "传统手工", subCategory: "陶艺" },
  { name: "中国结", category: "传统手工", subCategory: "编织" },
  { name: "竹编", category: "传统手工", subCategory: "编织" },
  { name: "榫卯结构", category: "传统手工", subCategory: "木作" },
  { name: "根雕", category: "传统手工", subCategory: "木作" },
]

/**
 * 用户定义(保留现有 admin 与 user,新增 2 个 TEACHER 与 3 个 USER)。
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
  /** 该用户绑定的标签名列表(用于后续 user_tags 关联) */
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

  // === 2. 用户定义 ===
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
      tagNames: [
        "陈氏太极拳养生八式",
        "陈氏太极拳老架一路",
        "八段锦",
        "颜体楷书临摹",
        "兰亭序行书",
      ],
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
      tagNames: [
        "颜体楷书临摹",
        "兰亭序行书",
        "曹全碑隶书",
        "工笔花鸟",
      ],
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
      tagNames: ["陈氏太极拳养生八式", "八段锦"],
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
      tagNames: ["颜体楷书临摹", "兰亭序行书"],
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
      tagNames: ["古筝", "琵琶"],
    },
  ]

  // === 3. 圈子定义(均为王师傅创建) ===
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
      tagNames: ["陈氏太极拳养生八式", "陈氏太极拳老架一路", "八段锦"],
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
      tagNames: ["颜体楷书临摹", "兰亭序行书"],
    },
  ]

  // === 4. 插入用户(幂等:email 冲突时跳过) ===
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
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(inArray(tags.name, allTagNames))
  const existingTagNames = new Set(existingTags.map((t) => t.name))

  const newTagDefs = TAG_DEFINITIONS.filter(
    (t) => !existingTagNames.has(t.name)
  )
  if (newTagDefs.length > 0) {
    await db.insert(tags).values(
      newTagDefs.map((t) => {
        const { pinyin: py, pinyinInitials: pyInit } = computePinyin(t.name)
        return {
          name: t.name,
          category: t.category,
          subCategory: t.subCategory,
          pinyin: py,
          pinyinInitials: pyInit,
          status: "approved" as const,
        }
      })
    )
  }

  // === 7. 查询所有标签(获取 ID 与名称映射) ===
  const tagRows = await db
    .select({
      id: tags.id,
      name: tags.name,
      category: tags.category,
    })
    .from(tags)
    .where(inArray(tags.name, allTagNames))
  const tagByName = new Map(tagRows.map((t) => [t.name, t]))

  // === 8. 插入 user_tags 关联(幂等:唯一索引冲突时跳过) ===
  console.log("→ 绑定用户兴趣标签…")
  const userTagRows: { userId: string; tagId: string }[] = []
  for (const u of userSeeds) {
    if (!u.tagNames || u.tagNames.length === 0) continue
    const userRow = userByEmail.get(u.email)
    if (!userRow) continue
    for (const tagName of u.tagNames) {
      const tagRow = tagByName.get(tagName)
      if (!tagRow) continue
      userTagRows.push({ userId: userRow.id, tagId: tagRow.id })
    }
  }
  if (userTagRows.length > 0) {
    await db
      .insert(userTags)
      .values(userTagRows)
      .onConflictDoNothing({
        target: [userTags.userId, userTags.tagId],
      })
  }

  // === 9. 插入圈子(幂等:按 title 查询现有,只插入不存在的) ===
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
    })
  }

  // === 10. 查询所有圈子(获取 ID 映射) ===
  const allCircles = await db
    .select({
      id: circles.id,
      title: circles.title,
      creatorId: circles.creatorId,
    })
    .from(circles)
    .where(inArray(circles.title, circleTitles))
  const circleByTitle = new Map(allCircles.map((c) => [c.title, c]))

  // === 11. 插入 circle_tags 关联(幂等) ===
  console.log("→ 绑定圈子兴趣标签…")
  const circleTagRows: { circleId: string; tagId: string }[] = []
  for (const c of circleSeeds) {
    const circleRow = circleByTitle.get(c.title)
    if (!circleRow) continue
    for (const tagName of c.tagNames) {
      const tagRow = tagByName.get(tagName)
      if (!tagRow) continue
      circleTagRows.push({ circleId: circleRow.id, tagId: tagRow.id })
    }
  }
  if (circleTagRows.length > 0) {
    await db
      .insert(circleTags)
      .values(circleTagRows)
      .onConflictDoNothing({
        target: [circleTags.circleId, circleTags.tagId],
      })
  }

  // === 12. 插入 circle_members(创建者自动作为 creator 成员,幂等) ===
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
