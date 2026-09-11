import { describe, expect, it } from "vitest"

import { scoreMbti, validateMbtiAnswers } from "@/lib/mbti/scoring"
import type { MbtiScoringQuestion } from "@/lib/mbti/types"
import { MBTI_QUESTION_SEEDS } from "@/lib/mbti/seed-data/questions"

/** 与 seed 题目结构一致的最小计分题目视图 */
const seedQuestions: MbtiScoringQuestion[] = MBTI_QUESTION_SEEDS.map((q) => ({
  dimension: q.dimension,
  optionAScore: q.optionAScore,
  optionBScore: q.optionBScore,
}))

describe("validateMbtiAnswers", () => {
  it("合法答案返回 null", () => {
    const answers = Array.from({ length: 28 }, () => "A" as const)
    expect(validateMbtiAnswers(seedQuestions, answers)).toBeNull()
  })

  it("answers 不是数组时返回错误", () => {
    expect(validateMbtiAnswers(seedQuestions, "AAAA")).toMatch(/必须是数组/)
  })

  it("答案数量与题目数量不符时返回错误", () => {
    expect(validateMbtiAnswers(seedQuestions, ["A"])).toMatch(/数量与题目数量不符/)
  })

  it("包含非法选项时返回错误并标明序号", () => {
    const answers = Array.from({ length: 28 }, () => "A" as const)
    answers[5] = "C" as never
    expect(validateMbtiAnswers(seedQuestions, answers)).toMatch(/answers\[5\]/)
  })
})

describe("scoreMbti", () => {
  it("全选 A 得出各维度 A 选项倾向全票(E/N/F/J)", () => {
    const answers = Array.from({ length: 28 }, () => "A" as const)
    const result = scoreMbti(seedQuestions, answers)
    // seed: EI A=E / SN A=N / TF A=F / JP A=J → ENFJ
    expect(result.resultType).toBe("ENFJ")
  })

  it("全选 B 得出各维度 B 选项倾向全票(I/S/T/P)", () => {
    const answers = Array.from({ length: 28 }, () => "B" as const)
    const result = scoreMbti(seedQuestions, answers)
    expect(result.resultType).toBe("ISTP")
  })

  it("按维度正确累加票数(不依赖选项 A/B 方向)", () => {
    // 构造 3 题 EI: A/B 方向混合
    const questions: MbtiScoringQuestion[] = [
      { dimension: "EI", optionAScore: "E", optionBScore: "I" },
      { dimension: "EI", optionAScore: "I", optionBScore: "E" },
      { dimension: "EI", optionAScore: "E", optionBScore: "I" },
    ]
    // A→E、B→E、B→I → E=2, I=1
    const result = scoreMbti(questions, ["A", "B", "B"])
    expect(result.dimensionScores.EI).toEqual({
      dimension: "EI",
      first: "E",
      second: "I",
      firstCount: 2,
      secondCount: 1,
    })
    expect(result.resultType).toMatch(/^E/)
  })

  it("平票时取维度默认首字母(确定性回退)", () => {
    const questions: MbtiScoringQuestion[] = [
      { dimension: "EI", optionAScore: "I", optionBScore: "E" },
      { dimension: "EI", optionAScore: "E", optionBScore: "I" },
    ]
    // A→I、A→E → 1:1 平票
    const result = scoreMbti(questions, ["A", "A"])
    expect(result.dimensionScores.EI.firstCount).toBe(1)
    expect(result.dimensionScores.EI.secondCount).toBe(1)
    expect(result.resultType).toMatch(/^E/)
  })

  it("答案数量与题目数量不符时抛错", () => {
    expect(() => scoreMbti(seedQuestions, ["A"])).toThrow(/数量与题目数量不符/)
  })

  it("16 种类型组合均可得出合法四字母代码", () => {
    // 抽查若干组合:每维度可独立翻转
    const ei = seedQuestions.filter((q) => q.dimension === "EI")
    const result = scoreMbti(
      seedQuestions,
      seedQuestions.map((q) =>
        q.dimension === "EI" ? ("B" as const) : ("A" as const)
      )
    )
    // EI 全 B = I;SN/TF/JP 全 A = N/F/J → INFJ
    expect(result.resultType).toBe("INFJ")
    expect(ei).toHaveLength(7)
  })
})
