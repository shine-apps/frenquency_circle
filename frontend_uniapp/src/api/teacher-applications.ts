import { http } from '@/http/http'

/** 认证材料文件项(与后端 CertificationFile 对齐) */
export interface CertificationFile {
  url: string
  key: string
  size: number
  mimeType: string
  originalName: string
}

/** 教师认证申请 DTO(GET /api/teacher-applications/mine 返回) */
export interface TeacherApplicationDTO {
  id: string
  userId: string
  circleId: string | null
  files: CertificationFile[]
  /** 身份证人像面(必填) */
  idCardFront: CertificationFile | null
  /** 身份证国徽面(必填) */
  idCardBack: CertificationFile | null
  status: 'pending' | 'approved' | 'rejected'
  reviewNote: string | null
  createdAt: string
  updatedAt: string
}

/** 提交教师认证申请返回 */
export interface SubmitCertResult {
  applicationId: string
  status: string
}

/**
 * 提交教师认证申请。
 * - POST /api/teacher-applications
 * - 仅 USER 角色可调;已有 pending 申请时后端返回 409
 *
 * @param files 认证材料文件列表(1-5 个)
 * @param idCardFront 身份证人像面(必填)
 * @param idCardBack 身份证国徽面(必填)
 */
export function submitTeacherApplication(
  files: CertificationFile[],
  idCardFront: CertificationFile,
  idCardBack: CertificationFile,
) {
  return http.post<SubmitCertResult>('/api/teacher-applications', {
    files,
    idCardFront,
    idCardBack,
  })
}

/**
 * 查询当前用户最新的教师认证申请。
 * - GET /api/teacher-applications/mine
 * - 返回最近一条申请记录,无记录时返回 null
 */
export function getMyApplication() {
  return http.get<TeacherApplicationDTO | null>('/api/teacher-applications/mine')
}
