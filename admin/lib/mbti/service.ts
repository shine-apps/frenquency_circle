import { and, asc, desc, eq, gt } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  categories,
  hobbyTags,
  mbtiHobbyScores,
  mbtiQuestions,
  mbtiTestRecords,
  mbtiTypes,
  type MbtiTypeCode,
} from "@/db/schema"
import { MBTI_DIMENSIONS, type MbtiDimensionScores } from "@/lib/mbti/types"
import type {
  MbtiDimensionScoreDTO,
  MbtiHobbyRecommendationDTO,
  MbtiQuestionDTO,
  MbtiTypeDTO,
} from "@/types/api"

/**
 * 把计分快照(按维度索引的 Record)转换为 DTO 数组。
 * jsonb 中以数组形式存储,提交计分结果为 Record,统一在响应/落库前转换。
 */
export function toDimensionScoreDTOArray(
  scores: MbtiDimensionScores | Record<string, MbtiDimensionScoreDTO>
): MbtiDimensionScoreDTO[] {
  return MBTI_DIMENSIONS.map(
    (dimension) =>
      scores[dimension as keyof typeof scores] as MbtiDimensionScoreDTO
  ).filter(Boolean)
}

/**
 * MBTI 业务查询服务(submit / types / records 共用)。
 * 全部走 Drizzle 查询,数据量小,无需额外缓存。
 */

/** 查询参与测试的题目(active,按 sortOrder 升序),返回计分所需的最小字段 */
export async function getActiveScoringQuestions() {
  return db
    .select({
      id: mbtiQuestions.id,
      dimension: mbtiQuestions.dimension,
      optionAScore: mbtiQuestions.optionAScore,
      optionBScore: mbtiQuestions.optionBScore,
    })
    .from(mbtiQuestions)
    .where(eq(mbtiQuestions.status, "active"))
    .orderBy(asc(mbtiQuestions.sortOrder), asc(mbtiQuestions.createdAt))
}

/** 查询参与测试的题目(active)完整 DTO,用于出题接口 */
export async function getActiveQuestionDTOs(): Promise<MbtiQuestionDTO[]> {
  const rows = await db
    .select({
      id: mbtiQuestions.id,
      dimension: mbtiQuestions.dimension,
      stem: mbtiQuestions.stem,
      optionA: mbtiQuestions.optionA,
      optionB: mbtiQuestions.optionB,
      sortOrder: mbtiQuestions.sortOrder,
    })
    .from(mbtiQuestions)
    .where(eq(mbtiQuestions.status, "active"))
    .orderBy(asc(mbtiQuestions.sortOrder), asc(mbtiQuestions.createdAt))
  return rows
}

/** 按 code 查询人格类型文案 */
export async function getMbtiTypeByCode(
  code: string
): Promise<MbtiTypeDTO | null> {
  const row = await db
    .select({
      code: mbtiTypes.code,
      name: mbtiTypes.name,
      nickname: mbtiTypes.nickname,
      description: mbtiTypes.description,
      strengths: mbtiTypes.strengths,
      weaknesses: mbtiTypes.weaknesses,
    })
    .from(mbtiTypes)
    .where(eq(mbtiTypes.code, code as MbtiTypeCode))
    .limit(1)
  return row[0] ?? null
}

/** 查询全部 16 型(按 code 升序,稳定分组展示) */
export async function listMbtiTypes(): Promise<MbtiTypeDTO[]> {
  return db
    .select({
      code: mbtiTypes.code,
      name: mbtiTypes.name,
      nickname: mbtiTypes.nickname,
      description: mbtiTypes.description,
      strengths: mbtiTypes.strengths,
      weaknesses: mbtiTypes.weaknesses,
    })
    .from(mbtiTypes)
    .orderBy(asc(mbtiTypes.code))
}

/**
 * 查询某人格类型的爱好推荐(概率矩阵 JOIN 标签库)。
 *
 * 仅取概率 > 0 且 active 的条目,按 matchProbability 降序 + sortOrder 升序,
 * 默认取 top 6(结果页推荐列表)。
 */
export async function getRecommendationsForType(
  typeCode: string,
  limit = 6
): Promise<MbtiHobbyRecommendationDTO[]> {
  return db
    .select({
      hobbyTagId: mbtiHobbyScores.hobbyTagId,
      tagName: hobbyTags.name,
      categoryName: categories.name,
      matchProbability: mbtiHobbyScores.matchProbability,
      reason: mbtiHobbyScores.reason,
    })
    .from(mbtiHobbyScores)
    .innerJoin(hobbyTags, eq(mbtiHobbyScores.hobbyTagId, hobbyTags.id))
    .leftJoin(categories, eq(hobbyTags.categoryId, categories.id))
    .where(
      and(
        eq(mbtiHobbyScores.typeCode, typeCode as MbtiTypeCode),
        eq(mbtiHobbyScores.status, "active"),
        gt(mbtiHobbyScores.matchProbability, 0)
      )
    )
    .orderBy(
      desc(mbtiHobbyScores.matchProbability),
      asc(mbtiHobbyScores.sortOrder)
    )
    .limit(limit)
}

/** 落库一条测试记录(仅登录用户调用;dimensionScores 以数组形式入 jsonb) */
export async function saveTestRecord(params: {
  userId: string
  answers: string[]
  resultType: MbtiTypeCode
  dimensionScores: MbtiDimensionScoreDTO[]
}): Promise<string> {
  const [row] = await db
    .insert(mbtiTestRecords)
    .values({
      userId: params.userId,
      answers: params.answers,
      resultType: params.resultType,
      dimensionScores: params.dimensionScores,
    })
    .returning({ id: mbtiTestRecords.id })
  return row.id
}

/** 查询当前用户的历史记录(时间倒序) */
export async function listTestRecordsByUser(
  userId: string,
  limit = 50
) {
  return db
    .select({
      id: mbtiTestRecords.id,
      resultType: mbtiTestRecords.resultType,
      dimensionScores: mbtiTestRecords.dimensionScores,
      createdAt: mbtiTestRecords.createdAt,
    })
    .from(mbtiTestRecords)
    .where(eq(mbtiTestRecords.userId, userId))
    .orderBy(desc(mbtiTestRecords.createdAt))
    .limit(limit)
}

/** 按 id 查询单条记录(仅返回该用户自己的记录,防越权) */
export async function getTestRecordById(userId: string, recordId: string) {
  const rows = await db
    .select({
      id: mbtiTestRecords.id,
      resultType: mbtiTestRecords.resultType,
      dimensionScores: mbtiTestRecords.dimensionScores,
      createdAt: mbtiTestRecords.createdAt,
    })
    .from(mbtiTestRecords)
    .where(
      and(eq(mbtiTestRecords.id, recordId), eq(mbtiTestRecords.userId, userId))
    )
    .limit(1)
  return rows[0] ?? null
}
