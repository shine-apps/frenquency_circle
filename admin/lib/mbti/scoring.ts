import {
  MBTI_DIMENSIONS,
  type MbtiAnswerOption,
  type MbtiDimension,
  type MbtiDimensionScore,
  type MbtiDimensionScores,
  type MbtiLetter,
  type MbtiScoreResult,
  type MbtiScoringQuestion,
} from "./types"

/** 每个维度的默认倾向字母对(first 为结果页主倾向字母) */
const DIMENSION_LETTER_PAIRS: Record<MbtiDimension, [MbtiLetter, MbtiLetter]> =
  {
    EI: ["E", "I"],
    SN: ["S", "N"],
    TF: ["T", "F"],
    JP: ["J", "P"],
  }

/**
 * 校验题目的两个选项计分字母是否为该维度的一对倾向字母
 * (如 dimension='EI' 时必须分别为 'E'/'I')。
 * 返回错误描述(管理端新增/编辑题目时使用),合法时返回 null。
 */
export function validateOptionScores(
  dimension: MbtiDimension,
  a: MbtiLetter,
  b: MbtiLetter
): string | null {
  const [first, second] = DIMENSION_LETTER_PAIRS[dimension]
  const allowed = new Set<MbtiLetter>([first, second])
  if (!allowed.has(a) || !allowed.has(b)) {
    return `维度 ${dimension} 的选项计分字母只能是 '${first}' 或 '${second}'`
  }
  if (a === b) {
    return `两个选项的计分字母不能相同`
  }
  return null
}

/**
 * 校验答案数组:长度与题目一致,每项均为 'A' | 'B'。
 *
 * 返回错误描述(用于 API 返回 400),合法时返回 null。
 */
export function validateMbtiAnswers(
  questions: MbtiScoringQuestion[],
  answers: unknown
): string | null {
  if (!Array.isArray(answers)) {
    return "answers 必须是数组"
  }
  if (answers.length !== questions.length) {
    return `answers 数量与题目数量不符:期望 ${questions.length} 题,收到 ${answers.length} 项`
  }
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i]
    if (answer !== "A" && answer !== "B") {
      return `answers[${i}] 非法:只能是 'A' 或 'B'`
    }
  }
  return null
}

/**
 * MBTI 计分纯函数。
 *
 * 按 `questions` 的顺序逐题取 `answers` 对应选项的计分字母累加,
 * 得出各维度倾向票数与四字母结果。前端只提交选项 key('A'|'B'),
 * 计分完全在服务端完成,防止篡改。
 *
 * 要求:`answers.length === questions.length`(调用前先用 validateMbtiAnswers 校验)。
 */
export function scoreMbti(
  questions: MbtiScoringQuestion[],
  answers: MbtiAnswerOption[]
): MbtiScoreResult {
  if (answers.length !== questions.length) {
    throw new Error(
      `answers 数量与题目数量不符:期望 ${questions.length} 题,收到 ${answers.length} 项`
    )
  }

  const counts = new Map<MbtiLetter, number>()
  for (const letter of [
    "E",
    "I",
    "S",
    "N",
    "T",
    "F",
    "J",
    "P",
  ] as MbtiLetter[]) {
    counts.set(letter, 0)
  }

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]
    const answer = answers[i]
    const letter = answer === "A" ? question.optionAScore : question.optionBScore
    counts.set(letter, (counts.get(letter) ?? 0) + 1)
  }

  const dimensionScores = Object.fromEntries(
    MBTI_DIMENSIONS.map((dimension) => {
      const [first, second] = DIMENSION_LETTER_PAIRS[dimension]
      const entry: [MbtiDimension, MbtiDimensionScore] = [
        dimension,
        {
          dimension,
          first,
          second,
          firstCount: counts.get(first) ?? 0,
          secondCount: counts.get(second) ?? 0,
        },
      ]
      return entry
    })
  ) as MbtiDimensionScores

  const resultType =
    (dimensionScores.EI.firstCount >= dimensionScores.EI.secondCount
      ? "E"
      : "I") +
    (dimensionScores.SN.firstCount >= dimensionScores.SN.secondCount
      ? "S"
      : "N") +
    (dimensionScores.TF.firstCount >= dimensionScores.TF.secondCount
      ? "T"
      : "F") +
    (dimensionScores.JP.firstCount >= dimensionScores.JP.secondCount
      ? "J"
      : "P")

  return {
    resultType: resultType as MbtiScoreResult["resultType"],
    dimensionScores,
  }
}
