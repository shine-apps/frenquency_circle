import React, { useState } from 'react'
import { View, Text, ScrollView, Image } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import Taro, { useDidShow } from '@tarojs/taro'
import { useUserStore } from '@/store/user'
import { uploadFile } from '@/services/upload'
import {
  submitTeacherApplication,
  getMyApplication,
} from '@/services/teacher-applications'
import type { TeacherApplicationDTO } from '@/services/teacher-applications'
import styles from './index.module.scss'

/** 认证材料数量限制 */
const CERT_FILES_MIN = 1
const CERT_FILES_MAX = 5

/** 状态标签映射 */
const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '审核中', color: '#ff7d00' },
  approved: { text: '已通过', color: '#00b42a' },
  rejected: { text: '已驳回', color: '#f53f3f' },
}

/**
 * 教师认证页面。
 *
 * 三种状态:
 * - 未申请:展示身份证正反面 + 认证材料上传区域 + 提交按钮
 * - pending:展示审核中状态 + 已提交材料列表
 * - approved:展示已通过(用户已是 TEACHER,引导去创建圈子)
 * - rejected:展示驳回原因 + 重新提交按钮
 *
 * 必填项:身份证人像面、身份证国徽面、至少 1 个认证材料
 */
const TeacherCertificationPage: React.FC = () => {
  const user = useUserStore((s) => s.user)
  const setProfile = useUserStore((s) => s.setProfile)

  const [application, setApplication] = useState<TeacherApplicationDTO | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [files, setFiles] = useState<CertificationFile[]>([])
  const [idCardFront, setIdCardFront] = useState<CertificationFile | null>(null)
  const [idCardBack, setIdCardBack] = useState<CertificationFile | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  /** 进入时查询认证状态 */
  useDidShow(() => {
    getMyApplication()
      .then((app) => setApplication(app))
      .catch(() => {
        // 静默
      })
      .finally(() => setLoading(false))
  })

  /** 选择认证材料(图片或视频),逐个上传 */
  const handlePickCert = async (): Promise<void> => {
    if (uploading) return
    const remaining = CERT_FILES_MAX - files.length
    if (remaining <= 0) {
      Taro.showToast({ title: `最多 ${CERT_FILES_MAX} 个文件`, icon: 'none' })
      return
    }
    try {
      const res = await Taro.chooseMedia({
        count: remaining,
        mediaType: ['image', 'video'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        maxDuration: 60,
        camera: 'back',
      })
      if (!res.tempFiles?.length) return
      setUploading(true)
      const uploaded: CertificationFile[] = []
      for (const f of res.tempFiles) {
        try {
          const file: string | File = f.originalFileObj ?? f.tempFilePath
          const name =
            (f.originalFileObj && (f.originalFileObj as File).name) ||
            f.tempFilePath ||
            `cert-${Date.now()}`
          const result = await uploadFile({ file, name, purpose: 'generic' })
          uploaded.push({
            url: result.url,
            key: result.key,
            size: result.size,
            mimeType: result.mimeType,
            originalName: result.originalName,
          })
        } catch (e) {
          console.warn('[teacher-cert] upload failed:', e)
        }
      }
      if (uploaded.length === 0) {
        Taro.showToast({ title: '上传失败,请重试', icon: 'none' })
        return
      }
      setFiles((prev) => [...prev, ...uploaded].slice(0, CERT_FILES_MAX))
      Taro.showToast({
        title: `已上传 ${uploaded.length} 个文件`,
        icon: 'success',
      })
    } catch (e) {
      const err = e as Error & { errMsg?: string }
      if (err?.errMsg && /cancel/i.test(err.errMsg)) return
      Taro.showToast({
        title: err?.message || '选择文件失败',
        icon: 'none',
      })
    } finally {
      setUploading(false)
    }
  }

  /** 删除指定认证材料 */
  const handleRemoveCert = (idx: number): void => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  /** 选择身份证图片(仅图片,单张),side 区分正反面 */
  const handlePickIdCard = async (side: 'front' | 'back'): Promise<void> => {
    if (uploading) return
    try {
      const res = await Taro.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        camera: 'back',
      })
      if (!res.tempFiles?.length) return
      setUploading(true)
      const f = res.tempFiles[0]
      const file: string | File = f.originalFileObj ?? f.tempFilePath
      const name =
        (f.originalFileObj && (f.originalFileObj as File).name) ||
        f.tempFilePath ||
        `idcard-${side}-${Date.now()}`
      const result = await uploadFile({ file, name, purpose: 'generic' })
      const cert: CertificationFile = {
        url: result.url,
        key: result.key,
        size: result.size,
        mimeType: result.mimeType,
        originalName: result.originalName,
      }
      if (side === 'front') setIdCardFront(cert)
      else setIdCardBack(cert)
      Taro.showToast({ title: '上传成功', icon: 'success' })
    } catch (e) {
      const err = e as Error & { errMsg?: string }
      if (err?.errMsg && /cancel/i.test(err.errMsg)) return
      Taro.showToast({
        title: err?.message || '上传失败',
        icon: 'none',
      })
    } finally {
      setUploading(false)
    }
  }

  /** 移除身份证图片 */
  const handleRemoveIdCard = (side: 'front' | 'back'): void => {
    if (side === 'front') setIdCardFront(null)
    else setIdCardBack(null)
  }

  /** 提交认证申请 */
  const handleSubmit = async (): Promise<void> => {
    if (files.length < CERT_FILES_MIN) {
      Taro.showToast({
        title: `请至少上传 ${CERT_FILES_MIN} 个认证材料`,
        icon: 'none',
      })
      return
    }
    if (!idCardFront || !idCardBack) {
      Taro.showToast({ title: '请上传身份证正反面', icon: 'none' })
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      await submitTeacherApplication(files, idCardFront, idCardBack)
      Taro.showToast({ title: '提交成功,请等待审核', icon: 'success' })
      // 刷新状态
      const app = await getMyApplication()
      setApplication(app)
      setFiles([])
      setIdCardFront(null)
      setIdCardBack(null)
    } catch (e) {
      Taro.showToast({
        title: (e as Error).message || '提交失败',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  /** 重新提交(驳回后) */
  const handleRetry = (): void => {
    setApplication(null)
    setFiles([])
    setIdCardFront(null)
    setIdCardBack(null)
  }

  /** 跳转到创建圈子页 */
  const handleGoCreateCircle = (): void => {
    Taro.navigateTo({ url: '/pages/create-circle/index' })
  }

  const canSubmit =
    !!idCardFront &&
    !!idCardBack &&
    files.length >= CERT_FILES_MIN &&
    files.length <= CERT_FILES_MAX &&
    !submitting

  const isTeacher = user?.role === 'TEACHER'

  return (
    <View className={styles.page}>
      <ScrollView scrollY className={styles.scroll}>
        {/* ====== 标题区 ====== */}
        <View className={styles.header}>
          <Text className={styles.title}>教师认证</Text>
          <Text className={styles.subtitle}>
            上传身份证与资质证书,通过审核后即可成为认证教师,创建自己的圈子
          </Text>
        </View>

        {loading ? (
          <View className={styles.center}>
            <Text className={styles.muted}>加载中...</Text>
          </View>
        ) : isTeacher ? (
          /* ====== 已是 TEACHER ====== */
          <View className={styles.statusCard}>
            <View className={styles.statusHeader}>
              <View
                className={styles.statusDot}
                style={{ backgroundColor: '#00b42a' }}
              />
              <Text className={styles.statusText} style={{ color: '#00b42a' }}>
                已认证
              </Text>
            </View>
            <Text className={styles.statusDesc}>
              您已是认证教师,可以创建和管理圈子
            </Text>
            <Button
              type="primary"
              shape="round"
              block
              size="large"
              onClick={handleGoCreateCircle}
            >
              去创建圈子
            </Button>
          </View>
        ) : application ? (
          /* ====== 已有申请记录 ====== */
          <View className={styles.statusCard}>
            <View className={styles.statusHeader}>
              <View
                className={styles.statusDot}
                style={{
                  backgroundColor:
                    STATUS_MAP[application.status]?.color ?? '#86909c',
                }}
              />
              <Text
                className={styles.statusText}
                style={{
                  color:
                    STATUS_MAP[application.status]?.color ?? '#86909c',
                }}
              >
                {STATUS_MAP[application.status]?.text ?? application.status}
              </Text>
            </View>

            {application.status === 'approved' && (
              <>
                <Text className={styles.statusDesc}>
                  恭喜!您的教师认证已通过,现在可以创建圈子了
                </Text>
                <Button
                  type="primary"
                  shape="round"
                  block
                  size="large"
                  onClick={handleGoCreateCircle}
                  style={{ marginTop: '24rpx' }}
                >
                  去创建圈子
                </Button>
              </>
            )}

            {application.status === 'pending' && (
              <Text className={styles.statusDesc}>
                您的认证申请正在审核中,请耐心等待管理员审核
              </Text>
            )}

            {application.status === 'rejected' && (
              <>
                <Text className={styles.statusDesc}>
                  您的认证申请已被驳回
                  {application.reviewNote
                    ? `:${application.reviewNote}`
                    : ',请根据要求重新提交'}
                </Text>
                <Button
                  type="primary"
                  shape="round"
                  block
                  size="large"
                  onClick={handleRetry}
                  style={{ marginTop: '24rpx' }}
                >
                  重新提交
                </Button>
              </>
            )}

            {/* 已提交材料展示 */}
            {application.files?.length > 0 ||
            application.idCardFront ||
            application.idCardBack ? (
              <View className={styles.filesSection}>
                <Text className={styles.filesTitle}>已提交材料</Text>

                {/* 身份证正反面 */}
                {(application.idCardFront || application.idCardBack) && (
                  <View className={styles.idCardGrid}>
                    {application.idCardFront && (
                      <Image
                        src={application.idCardFront.url}
                        className={styles.idCardThumb}
                        mode="aspectFill"
                      />
                    )}
                    {application.idCardBack && (
                      <Image
                        src={application.idCardBack.url}
                        className={styles.idCardThumb}
                        mode="aspectFill"
                      />
                    )}
                  </View>
                )}

                {/* 认证材料 */}
                {application.files?.length > 0 && (
                  <View className={styles.certGrid}>
                    {application.files.map((f, idx) => (
                      <View key={f.key || idx} className={styles.certItem}>
                        {f.mimeType.startsWith('image/') ? (
                          <Image
                            src={f.url}
                            className={styles.certThumb}
                            mode="aspectFill"
                          />
                        ) : (
                          <View className={styles.certVideo}>
                            <Text className={styles.certVideoIcon}>🎬</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : null}
          </View>
        ) : (
          /* ====== 未申请:上传区域 ====== */
          <View className={styles.uploadCard}>
            {/* 身份证正反面(必填) */}
            <View className={styles.idCardSection}>
              <View className={styles.uploadTitle}>
                身份证正反面 <Text className={styles.required}>*</Text>
              </View>
              <Text className={styles.uploadHint}>
                请上传清晰的身份证照片(人像面 + 国徽面),仅支持图片
              </Text>
              <View className={styles.idCardGrid}>
                {/* 人像面 */}
                {idCardFront ? (
                  <View className={styles.idCardSlot}>
                    <Image
                      src={idCardFront.url}
                      className={styles.idCardThumb}
                      mode="aspectFill"
                    />
                    <View
                      className={styles.idCardRemove}
                      onClick={() => handleRemoveIdCard('front')}
                    >
                      <Text className={styles.idCardRemoveIcon}>×</Text>
                    </View>
                  </View>
                ) : (
                  <View
                    className={styles.idCardPlaceholder}
                    onClick={() => handlePickIdCard('front')}
                  >
                    <Text className={styles.idCardPlaceholderIcon}>＋</Text>
                    <Text className={styles.idCardPlaceholderText}>
                      人像面
                    </Text>
                  </View>
                )}
                {/* 国徽面 */}
                {idCardBack ? (
                  <View className={styles.idCardSlot}>
                    <Image
                      src={idCardBack.url}
                      className={styles.idCardThumb}
                      mode="aspectFill"
                    />
                    <View
                      className={styles.idCardRemove}
                      onClick={() => handleRemoveIdCard('back')}
                    >
                      <Text className={styles.idCardRemoveIcon}>×</Text>
                    </View>
                  </View>
                ) : (
                  <View
                    className={styles.idCardPlaceholder}
                    onClick={() => handlePickIdCard('back')}
                  >
                    <Text className={styles.idCardPlaceholderIcon}>＋</Text>
                    <Text className={styles.idCardPlaceholderText}>
                      国徽面
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* 认证材料 */}
            <View className={styles.filesSection}>
              <Text className={styles.uploadTitle}>
                上传认证材料 <Text className={styles.required}>*</Text>
              </Text>
              <Text className={styles.uploadHint}>
                支持图片或视频,共 {CERT_FILES_MIN}-{CERT_FILES_MAX} 个文件(
                {files.length}/{CERT_FILES_MAX})
              </Text>

              <View className={styles.certGrid}>
                {files.map((f, idx) => (
                  <View key={f.key} className={styles.certItem}>
                    {f.mimeType.startsWith('image/') ? (
                      <Image
                        src={f.url}
                        className={styles.certThumb}
                        mode="aspectFill"
                      />
                    ) : (
                      <View className={styles.certVideo}>
                        <Text className={styles.certVideoIcon}>🎬</Text>
                      </View>
                    )}
                    <View
                      className={styles.certRemove}
                      onClick={() => handleRemoveCert(idx)}
                    >
                      <Text className={styles.certRemoveIcon}>×</Text>
                    </View>
                  </View>
                ))}
                {files.length < CERT_FILES_MAX && (
                  <View className={styles.certAdd} onClick={handlePickCert}>
                    <Text className={styles.certAddIcon}>+</Text>
                    <Text className={styles.certAddText}>
                      {uploading ? '上传中...' : '添加'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ====== 底部提交按钮(仅未申请状态) ====== */}
      {!isTeacher && !application && (
        <View className={styles.footer}>
          <Button
            type="primary"
            shape="round"
            block
            size="large"
            loading={submitting}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            提交认证
          </Button>
          {(!idCardFront || !idCardBack || files.length === 0) && (
            <Text className={styles.footerHint}>
              请上传身份证正反面及至少 1 个认证材料
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

export default TeacherCertificationPage
