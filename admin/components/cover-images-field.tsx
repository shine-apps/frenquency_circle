"use client"

import { useRef, useState } from "react"
import { Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { COVER_IMAGES_MAX } from "@/lib/form-limits"
import { uploadFileToCos } from "@/lib/cos/upload"

/**
 * 图片上传字段(受控,圈子 / 活动 / 课程表单共用)。
 *
 * 统一走 COS 直传(`lib/cos/upload.ts`):文件字节不进 Next.js 进程,
 * 与小程序端共用同一存储桶与 STS scope(`uploads/<userId>/*`)。
 * `POST /api/upload` 本地通道保留作兜底,后台 UI 已不再调用。
 */
export function CoverImagesField({
  value,
  onChange,
  label,
  error,
}: {
  value: string[]
  onChange: (next: string[]) => void
  /** 字段名,默认「图片」 */
  label?: string
  /** 由父组件透出的错误文案(可选) */
  error?: string | null
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadError(null)

    const uploaded: string[] = []
    for (const file of Array.from(files)) {
      try {
        const result = await uploadFileToCos({ file })
        uploaded.push(result.url)
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "图片上传失败")
        break
      }
    }

    setUploading(false)
    if (inputRef.current) inputRef.current.value = ""
    if (uploaded.length > 0) {
      onChange([...value, ...uploaded].slice(0, COVER_IMAGES_MAX))
    }
  }

  const fieldLabel = label ?? "图片"

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label>
        {fieldLabel}（最多 {COVER_IMAGES_MAX} 张）
      </Label>

      {value.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="relative overflow-hidden rounded-lg border"
            >
              {/* 图片为 COS 公网 URL,直接用原生 img 即可 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${fieldLabel} ${index + 1}`}
                className="h-20 w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 text-destructive"
                aria-label="移除图片"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">尚未上传图片</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleUpload(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading || value.length >= COVER_IMAGES_MAX}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
        {uploading ? "上传中…" : "上传图片"}
      </Button>

      {uploadError || error ? (
        <p className="text-sm text-destructive">{uploadError || error}</p>
      ) : null}
    </div>
  )
}
