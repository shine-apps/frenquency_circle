"use client"

import { useRef, useState } from "react"
import { Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { COURSE_VIDEO_MAX_MB } from "@/lib/form-limits"
import { uploadFileToCos } from "@/lib/cos/upload"

/** 视频字段值:`videoUrl` 为 COS 公网地址;`durationSeconds` 由 <video> 元数据探测 */
export type CosVideoValue = { videoUrl: string; durationSeconds: number | null }

/** 秒 → 「x 分 y 秒」(可读时长) */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`
}

/**
 * 视频上传字段(受控)。
 *
 * 选择文件 → 客户端预校验体积 → COS 直传(带进度)→ `<video>` 预览
 * (元数据回调回传时长)→ 替换 / 移除。
 *
 * 失败信息在字段内联展示,不静默、不阻断其他字段编辑。
 */
export function CosVideoField({
  value,
  onChange,
  label = "课时视频",
  error,
}: {
  value: CosVideoValue | null
  onChange: (next: CosVideoValue | null) => void
  label?: string
  error?: string | null
}) {
  const [progress, setProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploading = progress !== null

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > COURSE_VIDEO_MAX_MB * 1024 * 1024) {
      setUploadError(`视频不能超过 ${COURSE_VIDEO_MAX_MB} MB`)
      return
    }
    setUploadError(null)
    setProgress(0)
    try {
      const result = await uploadFileToCos({
        file,
        onProgress: (percent) => setProgress(percent),
      })
      // 先占位,元数据加载后再回传真实时长
      onChange({ videoUrl: result.url, durationSeconds: null })
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "视频上传失败")
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>

      {value?.videoUrl ? (
        <div className="space-y-2">
          <video
            controls
            preload="metadata"
            src={value.videoUrl}
            className="w-full rounded-lg border"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {value.durationSeconds
                ? `时长 ${formatDuration(value.durationSeconds)}`
                : "时长未知（播放后自动识别）"}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
                替换
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={uploading}
                onClick={() => {
                  setUploadError(null)
                  onChange(null)
                }}
                aria-label="移除视频"
              >
                <Trash2Icon />
                移除
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
            {uploading ? "上传中…" : "上传视频"}
          </Button>
          <p className="text-xs text-muted-foreground">
            支持 mp4 / webm / mov，单个不超过 {COURSE_VIDEO_MAX_MB} MB
          </p>
        </div>
      )}

      {progress !== null ? (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-xs text-muted-foreground">
            {progress}%
          </span>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {uploadError || error ? (
        <p className="text-sm text-destructive">{uploadError || error}</p>
      ) : null}
    </div>
  )
}
