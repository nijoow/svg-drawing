import { Drawing } from '@/types/type'
import { v4 as uuid } from 'uuid'
import { MediaPosition, rectangleVertices, resizeMediaFrame } from './frame'
import { embeddedImageDimensions } from '@/editor/document'

export type ImageCrop = NonNullable<Drawing['image']>['crop']
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 8192
export const MAX_IMAGE_PIXELS = 32 * 1000 * 1000
export const FULL_CROP: ImageCrop = { x: 0, y: 0, width: 1, height: 1 }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function normalizeCrop(crop: ImageCrop): ImageCrop {
  const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback)
  const width = clamp(finite(crop.width, 1), 0.01, 1)
  const height = clamp(finite(crop.height, 1), 0.01, 1)
  return {
    x: clamp(finite(crop.x, 0), 0, 1 - width),
    y: clamp(finite(crop.y, 0), 0, 1 - height),
    width,
    height,
  }
}

export function cropForAspectRatio(width: number, height: number, ratio: number): ImageCrop {
  if (![width, height, ratio].every((value) => Number.isFinite(value) && value > 0)) return { ...FULL_CROP }
  const originalRatio = width / height
  const cropWidth = originalRatio > ratio ? ratio / originalRatio : 1
  const cropHeight = originalRatio > ratio ? 1 : originalRatio / ratio
  return normalizeCrop({ x: (1 - cropWidth) / 2, y: (1 - cropHeight) / 2, width: cropWidth, height: cropHeight })
}

/** Cropping changes the frame, retaining the source pixels and existing object scale. */
export function cropImageDrawing(drawing: Drawing, input: ImageCrop): Drawing {
  if (drawing.type !== 'IMAGE' || !drawing.image) return drawing
  const crop = normalizeCrop(input)
  const previous = normalizeCrop(drawing.image.crop)
  return {
    ...resizeMediaFrame(
      drawing,
      (drawing.width * crop.width) / previous.width,
      (drawing.height * crop.height) / previous.height,
    ),
    image: { ...drawing.image, crop },
  }
}

export function validateImageDimensions(width: number, height: number): void {
  if (![width, height].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error('This image has invalid dimensions.')
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('Use an image up to 8,192 pixels per side and 32 megapixels. Resize a copy before importing.')
  }
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('The image could not be read. Try opening the file again.'))
    reader.onabort = () => reject(new Error('Image import was cancelled.'))
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('The image could not be read.'))
    }
    reader.readAsDataURL(file)
  })
}

function decodeDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timer = window.setTimeout(() => {
      image.onload = null
      image.onerror = null
      image.src = ''
      reject(new Error('Image decoding took too long. Try a smaller file.'))
    }, 20000)
    image.onload = () => {
      window.clearTimeout(timer)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('This image could not be decoded. Use a valid PNG, JPEG or WebP file.'))
    }
    image.src = src
  })
}

export async function importImageFile(file: File, position: MediaPosition): Promise<Drawing> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a PNG, JPEG or WebP image.')
  }
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error('Images must be smaller than 6 MB. Resize or compress a copy before importing.')
  }
  const src = await readDataUrl(file)
  const encoded = embeddedImageDimensions(src)
  validateImageDimensions(encoded.width, encoded.height)
  const native = await decodeDimensions(src)
  validateImageDimensions(native.width, native.height)
  const scale = Math.min(1, 640 / native.width, 480 / native.height)
  const width = native.width * scale
  const height = native.height * scale
  return {
    id: uuid(),
    type: 'IMAGE',
    subType: null,
    name: file.name.slice(0, 120) || 'Image',
    vertexs: rectangleVertices(position, width, height),
    width,
    height,
    center: { x: position.x + width / 2, y: position.y + height / 2 },
    rotate: 0,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
    opacity: 1,
    image: { src, naturalWidth: native.width, naturalHeight: native.height, crop: { ...FULL_CROP } },
  }
}
