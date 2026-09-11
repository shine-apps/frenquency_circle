/**
 * MBTI 28 题种子数据(每维度 7 题、A/B 二选一)。
 *
 * 题目底稿参考开源量表 OEJTS(Open Extended Jungian Type Scales,
 * openpsychometrics.org, CC BY-NC-SA 4.0)中各维度区分度最高的条目,
 * 改写为中文二选一生活情境题。
 *
 * 计分约定(与流传较广的 28 题简版一致):
 * - 第 1-7 题  维度 EI: A→E, B→I
 * - 第 8-14 题 维度 SN: A→N, B→S
 * - 第 15-21 题 维度 TF: A→F, B→T
 * - 第 22-28 题 维度 JP: A→J, B→P
 */

import type { MbtiDimension, MbtiLetter } from "@/lib/mbti/types"

export type MbtiQuestionSeed = {
  dimension: MbtiDimension
  stem: string
  optionA: string
  optionB: string
  optionAScore: MbtiLetter
  optionBScore: MbtiLetter
  sortOrder: number
}

export const MBTI_QUESTION_SEEDS: MbtiQuestionSeed[] = [
  // ===== E/I 维度(1-7 题) =====
  {
    dimension: "EI",
    stem: "参加聚会或热闹的活动之后，你通常感觉——",
    optionA: "精力充沛，意犹未尽",
    optionB: "有些疲惫，想一个人静静",
    optionAScore: "E",
    optionBScore: "I",
    sortOrder: 1,
  },
  {
    dimension: "EI",
    stem: "周末有空时，你更倾向于——",
    optionA: "约上朋友一起出去玩",
    optionB: "独自在家或安静地度过",
    optionAScore: "E",
    optionBScore: "I",
    sortOrder: 2,
  },
  {
    dimension: "EI",
    stem: "在小组交流中，你通常是——",
    optionA: "主动发言、带动气氛的那个人",
    optionB: "更多倾听、想好再说的那个人",
    optionAScore: "E",
    optionBScore: "I",
    sortOrder: 3,
  },
  {
    dimension: "EI",
    stem: "来到一个陌生的场合，你一般会——",
    optionA: "很快主动结识新朋友",
    optionB: "等别人先来打招呼",
    optionAScore: "E",
    optionBScore: "I",
    sortOrder: 4,
  },
  {
    dimension: "EI",
    stem: "心里有想法时，你更习惯——",
    optionA: "马上说给别人听",
    optionB: "先自己反复琢磨",
    optionAScore: "E",
    optionBScore: "I",
    sortOrder: 5,
  },
  {
    dimension: "EI",
    stem: "长时间独处会让你感到——",
    optionA: "无聊憋闷，想找人说说话",
    optionB: "轻松自在，正好给自己充电",
    optionAScore: "E",
    optionBScore: "I",
    sortOrder: 6,
  },
  {
    dimension: "EI",
    stem: "你的朋友圈更像——",
    optionA: "广而热闹，各行各业都有",
    optionB: "少而深交，多是相熟多年的人",
    optionAScore: "E",
    optionBScore: "I",
    sortOrder: 7,
  },

  // ===== S/N 维度(8-14 题) =====
  {
    dimension: "SN",
    stem: "学习新事物时，你更感兴趣的是——",
    optionA: "背后的原理和更多的可能性",
    optionB: "具体的做法和实际的用处",
    optionAScore: "N",
    optionBScore: "S",
    sortOrder: 8,
  },
  {
    dimension: "SN",
    stem: "向别人描述一件经历过的事，你更常讲——",
    optionA: "它带给你的启发和联想",
    optionB: "事情的实际经过和细节",
    optionAScore: "N",
    optionBScore: "S",
    sortOrder: 9,
  },
  {
    dimension: "SN",
    stem: "做规划时你更容易——",
    optionA: "畅想未来的各种可能",
    optionB: "从眼前的现实条件出发",
    optionAScore: "N",
    optionBScore: "S",
    sortOrder: 10,
  },
  {
    dimension: "SN",
    stem: "面对一幅作品（画、文章等），你更看重——",
    optionA: "它传递的意境和想象空间",
    optionB: "它是否逼真、技法是否扎实",
    optionAScore: "N",
    optionBScore: "S",
    sortOrder: 11,
  },
  {
    dimension: "SN",
    stem: "别人评价你时更可能说——",
    optionA: "你点子多、总在想着未来",
    optionB: "你脚踏实地、非常靠谱",
    optionAScore: "N",
    optionBScore: "S",
    sortOrder: 12,
  },
  {
    dimension: "SN",
    stem: "遇到问题时，你倾向先——",
    optionA: "跳出来想有没有新思路",
    optionB: "用验证过的老办法解决",
    optionAScore: "N",
    optionBScore: "S",
    sortOrder: 13,
  },
  {
    dimension: "SN",
    stem: "你更喜欢的表达风格是——",
    optionA: "比喻、隐喻，耐人寻味",
    optionB: "直白明确，字面意思",
    optionAScore: "N",
    optionBScore: "S",
    sortOrder: 14,
  },

  // ===== T/F 维度(15-21 题) =====
  {
    dimension: "TF",
    stem: "朋友向你倾诉烦恼时，你的第一反应是——",
    optionA: "先安慰他的情绪",
    optionB: "帮他分析问题、找出办法",
    optionAScore: "F",
    optionBScore: "T",
    sortOrder: 15,
  },
  {
    dimension: "TF",
    stem: "做重要决定时，你更看重——",
    optionA: "自己和身边人的感受",
    optionB: "客观逻辑和利弊分析",
    optionAScore: "F",
    optionBScore: "T",
    sortOrder: 16,
  },
  {
    dimension: "TF",
    stem: "看电影或读故事时，更打动你的是——",
    optionA: "人物的情感与关系",
    optionB: "情节的逻辑与设定",
    optionAScore: "F",
    optionBScore: "T",
    sortOrder: 17,
  },
  {
    dimension: "TF",
    stem: "评价一个方案，你首先关注——",
    optionA: "是否照顾到相关人的感受",
    optionB: "是否严密合理、站得住脚",
    optionAScore: "F",
    optionBScore: "T",
    sortOrder: 18,
  },
  {
    dimension: "TF",
    stem: "如果必须指出朋友的问题，你会——",
    optionA: "先肯定再委婉提醒，怕伤到人",
    optionB: "直接指出来，对事不对人",
    optionAScore: "F",
    optionBScore: "T",
    sortOrder: 19,
  },
  {
    dimension: "TF",
    stem: "你更希望被别人——",
    optionA: "喜爱和亲近",
    optionB: "尊重和认可",
    optionAScore: "F",
    optionBScore: "T",
    sortOrder: 20,
  },
  {
    dimension: "TF",
    stem: "争论中你更容易因为什么让步——",
    optionA: "对方情绪不好，不想伤害关系",
    optionB: "对方的论据确实更有道理",
    optionAScore: "F",
    optionBScore: "T",
    sortOrder: 21,
  },

  // ===== J/P 维度(22-28 题) =====
  {
    dimension: "JP",
    stem: "面对一件必须做的事，你通常——",
    optionA: "尽早列好计划完成",
    optionB: "不到最后不着急",
    optionAScore: "J",
    optionBScore: "P",
    sortOrder: 22,
  },
  {
    dimension: "JP",
    stem: "出门旅行你更喜欢——",
    optionA: "提前把行程安排定好",
    optionB: "随性走走，到了再说",
    optionAScore: "J",
    optionBScore: "P",
    sortOrder: 23,
  },
  {
    dimension: "JP",
    stem: "你的日常物品和空间通常——",
    optionA: "分类收纳、井井有条",
    optionB: "随手放置、比较随性",
    optionAScore: "J",
    optionBScore: "P",
    sortOrder: 24,
  },
  {
    dimension: "JP",
    stem: "计划被临时打乱时，你会——",
    optionA: "有点不爽，想尽快恢复秩序",
    optionB: "无所谓，正好换个玩法",
    optionAScore: "J",
    optionBScore: "P",
    sortOrder: 25,
  },
  {
    dimension: "JP",
    stem: "面对多个选择，你倾向于——",
    optionA: "尽快定下来，安心执行",
    optionB: "再看看，保留更多可能性",
    optionAScore: "J",
    optionBScore: "P",
    sortOrder: 26,
  },
  {
    dimension: "JP",
    stem: "你做事的风格更像——",
    optionA: "按部就班，讲究流程",
    optionB: "灵活应变，见机行事",
    optionAScore: "J",
    optionBScore: "P",
    sortOrder: 27,
  },
  {
    dimension: "JP",
    stem: "截止日期临近时，你一般——",
    optionA: "早已完成或进度过半",
    optionB: "正在最后赶工冲刺",
    optionAScore: "J",
    optionBScore: "P",
    sortOrder: 28,
  },
]
