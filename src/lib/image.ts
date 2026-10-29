import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES } from './constants'

export function validatePhoto(file: File): string | null {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) return 'Please choose a JPG, PNG or WebP image.'
  if (file.size > MAX_PHOTO_BYTES) return 'That image is larger than 8 MB. Please choose a smaller one.'
  return null
}

/** Resize to fit within `max` px and re-encode as JPEG. Also strips EXIF/location metadata. */
export async function compressImage(file: Blob, max = 1280, quality = 0.8): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read that image.'))
      el.src = url
    })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process image.'))), 'image/jpeg', quality),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
