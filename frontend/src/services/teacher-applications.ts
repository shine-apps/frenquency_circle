import { request } from './request'

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

export interface SubmitCertResult {
  applicationId: string
  status: string
}

interface SubmitCertPayload {
  files: CertificationFile[]
  idCardFront: CertificationFile
  idCardBack: CertificationFile
}

/**
 * 提交教师认证申请。
 * @param files 认证材料文件列表(1-5 个)
 * @param idCardFront 身份证人像面(必填)
 * @param idCardBack 身份证国徽面(必填)
 */
export async function submitTeacherApplication(
  files: CertificationFile[],
  idCardFront: CertificationFile,
  idCardBack: CertificationFile
): Promise<SubmitCertResult> {
  return request<SubmitCertResult>({
    url: '/api/teacher-applications',
    method: 'POST',
    data: { files, idCardFront, idCardBack } as unknown as Record<
      string,
      unknown
    >,
  })
}

/**
 * 查询当前用户最新的教师认证申请。
 * @returns 最近一条申请记录或 null
 */
export async function getMyApplication(): Promise<TeacherApplicationDTO | null> {
  return request<TeacherApplicationDTO | null>({
    url: '/api/teacher-applications/mine',
    method: 'GET',
  })
}
