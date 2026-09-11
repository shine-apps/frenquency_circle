/**
 * MBTI 16 型人格文案种子数据。
 *
 * 文案为通用人格类型描述(娱乐向),用于结果页与 16 型浏览页展示。
 */

import type { MbtiTypeCode } from "@/lib/mbti/types"

export type MbtiTypeSeed = {
  code: MbtiTypeCode
  name: string
  nickname: string
  description: string
  strengths: string[]
  weaknesses: string[]
}

export const MBTI_TYPE_SEEDS: MbtiTypeSeed[] = [
  {
    code: "INTJ",
    name: "建筑师",
    nickname: "运筹帷幄的策略家",
    description:
      "独立、有远见，擅长制定长期计划并一步步实现。喜欢钻研复杂问题，追求深度与效率，对感兴趣的事物有极强的专注力。",
    strengths: ["战略思维强", "独立自主", "专注钻研", "目标导向"],
    weaknesses: ["容易忽略他人感受", "对自己要求过高", "不擅即兴社交"],
  },
  {
    code: "INTP",
    name: "逻辑学家",
    nickname: "好奇求真的思考者",
    description:
      "喜欢探索概念与原理，享受理解事物运转规律的过程。思维灵活开放，对感兴趣领域有近乎痴迷的求知欲。",
    strengths: ["逻辑严密", "好奇心强", "善于分析", "思维开放"],
    weaknesses: ["容易拖延", "不喜琐事", "行动力偏弱"],
  },
  {
    code: "ENTJ",
    name: "指挥官",
    nickname: "天生的领导者",
    description:
      "果断、有魄力，擅长整合资源并带领团队达成目标。做事讲求效率与结果，喜欢挑战有难度的任务。",
    strengths: ["领导力强", "决策果断", "目标坚定", "执行力高"],
    weaknesses: ["有时过于强势", "耐心不足", "容易忽视细节情绪"],
  },
  {
    code: "ENTP",
    name: "辩论家",
    nickname: "点子不断的创新者",
    description:
      "机敏、爱挑战常规，享受头脑风暴与思想碰撞。擅长发现新机会，喜欢用新颖的方式解决问题。",
    strengths: ["创意十足", "口才出众", "适应力强", "敢想敢做"],
    weaknesses: ["容易三分钟热度", "不喜重复事务", "偶尔争强好胜"],
  },
  {
    code: "INFJ",
    name: "提倡者",
    nickname: "温和坚定的理想主义者",
    description:
      "洞察力强，能敏锐感知他人情绪，同时内心有坚定的信念。追求有意义的生活，愿意为认可的价值长期投入。",
    strengths: ["共情力强", "有远见", "意志坚定", "真诚待人"],
    weaknesses: ["容易内耗", "不善拒绝", "对自己要求苛刻"],
  },
  {
    code: "INFP",
    name: "调停者",
    nickname: "内心丰富的浪漫主义者",
    description:
      "温柔、有想象力，重视内心世界与个人价值。喜欢用独特的方式表达自己，对美与和谐有天然的敏感。",
    strengths: ["想象力丰富", "真诚善良", "审美敏锐", "忠于自我"],
    weaknesses: ["容易情绪化", "回避冲突", "计划性较弱"],
  },
  {
    code: "ENFJ",
    name: "主人公",
    nickname: "温暖有感染力的引导者",
    description:
      "热情、善解人意，擅长组织大家共同完成有意义的事。天然关心他人成长，是朋友圈中的黏合剂。",
    strengths: ["感染力强", "组织力好", "善解人意", "乐于助人"],
    weaknesses: ["过度付出", "在意他人评价", "容易忽略自身需求"],
  },
  {
    code: "ENFP",
    name: "竞选者",
    nickname: "热情洋溢的追梦人",
    description:
      "活力四射、好奇心旺盛，喜欢结交朋友、尝试新鲜事物。相信生活的可能性，善于点燃身边的热情。",
    strengths: ["热情外向", "创意丰富", "共情力强", "适应变化"],
    weaknesses: ["容易分心", "不擅收尾", "情绪起伏较大"],
  },
  {
    code: "ISTJ",
    name: "物流师",
    nickname: "严谨可靠的实干家",
    description:
      "务实、有条理，言出必行。擅长把事情安排得井井有条，是团队中最让人放心的一环。",
    strengths: ["责任心强", "严谨细致", "守信可靠", "执行力稳定"],
    weaknesses: ["偏保守", "不喜突变", "表达较为内敛"],
  },
  {
    code: "ISFJ",
    name: "守卫者",
    nickname: "温暖体贴的照顾者",
    description:
      "细心、温暖，默默把身边的人照顾得很好。重视传统与情谊，愿意在小事上持续用心。",
    strengths: ["体贴周到", "耐心细致", "责任心强", "忠诚可靠"],
    weaknesses: ["不善表达委屈", "容易操劳", "害怕冲突"],
  },
  {
    code: "ESTJ",
    name: "总经理",
    nickname: "雷厉风行的管理者",
    description:
      "务实、高效，擅长制定规则并推动落地。做事有板有眼，喜欢把混乱变得有序。",
    strengths: ["组织力强", "果断务实", "责任心强", "标准清晰"],
    weaknesses: ["有时固执", "缺乏弹性", "不擅共情表达"],
  },
  {
    code: "ESFJ",
    name: "执政官",
    nickname: "热心周到的凝聚者",
    description:
      "热情、爱张罗，享受把大家聚在一起的氛围。对他人的需要敏感，愿意为集体付出。",
    strengths: ["热心肠", "组织活动能力强", "人缘好", "细致周到"],
    weaknesses: ["在意评价", "过度迁就", "不善独处"],
  },
  {
    code: "ISTP",
    name: "鉴赏家",
    nickname: "冷静利落的匠人",
    description:
      "动手能力强，喜欢研究事物的构造与原理。遇事冷静，擅长在实际操作中找到最优解。",
    strengths: ["动手能力强", "临场冷静", "务实高效", "独立自主"],
    weaknesses: ["不善表达情感", "偏好独来独往", "容易喜新厌旧"],
  },
  {
    code: "ISFP",
    name: "探险家",
    nickname: "随性温柔的艺术家",
    description:
      "审美敏锐、性格温和，喜欢用作品和行动代替语言表达。享受当下的美好，讨厌被条条框框束缚。",
    strengths: ["审美出众", "温和包容", "动手能力好", "活在当下"],
    weaknesses: ["计划性弱", "回避冲突", "容易拖延"],
  },
  {
    code: "ESTP",
    name: "企业家",
    nickname: "敢想敢干的行动派",
    description:
      "精力充沛、反应快，喜欢冒险与挑战。擅长在真实场景中快速试错并抓住机会。",
    strengths: ["行动力极强", "抗压能力好", "机敏灵活", "社交自如"],
    weaknesses: ["不喜长期规划", "容易冲动", "耐心有限"],
  },
  {
    code: "ESFP",
    name: "表演者",
    nickname: "自带光芒的氛围担当",
    description:
      "活泼开朗、极具感染力，享受与人分享快乐的时刻。擅长活跃气氛，让平凡日常变得有趣。",
    strengths: ["感染力强", "热情大方", "应变力好", "审美时尚"],
    weaknesses: ["不擅规划", "容易分心", "害怕沉闷"],
  },
]
