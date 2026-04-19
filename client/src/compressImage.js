// Resizes and re-encodes an image to keep uploads fast and under the server limit.
// Uses OffscreenCanvas where available, falls back to a regular canvas.
export async function compressImage(file, { maxDim = 2048, quality = 0.85 } = {}) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  let blob
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
  } else {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality))
  }
  bitmap.close?.()
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
}
