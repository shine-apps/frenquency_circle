import { http } from '@/http/http'
import type {
  MbtiQuestionDTO,
  MbtiSubmitResultDTO,
  MbtiTestRecordDTO,
  MbtiTypeDTO,
  MbtiTypeDetailDTO,
} from '@/types'

/**
 * 获取参与测试的题目列表(公开)。
 * 仅返回 active 题目,按 sortOrder 升序;不含计分字母,计分在服务端完成。
 */
export function getMbtiQuestions() {
  return http.get<{ list: MbtiQuestionDTO[] }>('/api/mbti/questions')
}

/**
 * 提交测试答案并计算结果(游客可测)。
 * - `answers` 与题目顺序一一对应,每项为 'A' | 'B'
 * - 登录用户自动保存历史记录(响应 saved=true),游客不落库
 */
export function submitMbtiTest(answers: ('A' | 'B')[]) {
  return http.post<MbtiSubmitResultDTO>('/api/mbti/submit', { answers })
}

/**
 * 获取当前登录用户的测试历史(时间倒序,最多 50 条)。
 */
export function getMbtiRecords() {
  return http.get<{ list: MbtiTestRecordDTO[] }>('/api/mbti/records')
}

/**
 * 获取单条测试记录详情(仅本人)。
 */
export function getMbtiRecord(id: string) {
  return http.get<MbtiTestRecordDTO>(`/api/mbti/records/${id}`)
}

/**
 * 获取全部 16 型人格(公开)。
 */
export function getMbtiTypes() {
  return http.get<{ list: MbtiTypeDTO[] }>('/api/mbti/types')
}

/**
 * 获取单型详情 + 按概率降序的爱好推荐(公开)。
 */
export function getMbtiTypeDetail(code: string) {
  return http.get<MbtiTypeDetailDTO>(`/api/mbti/types/${code}`)
}
