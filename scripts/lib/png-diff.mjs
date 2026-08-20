/**
 * Minimal zero-dependency PNG decode + pixel diff, sufficient for the 8-bit
 * RGB/RGBA non-interlaced PNGs that Chrome's `--screenshot` produces. Keeps
 * visual regression self-contained (no `pixelmatch`/`pngjs` required).
 */
import { inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('不是合法 PNG')
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  if (bitDepth !== 8) throw new Error(`仅支持 8-bit PNG（bitDepth=${bitDepth}）`)
  if (interlace !== 0) throw new Error('不支持隔行 PNG')
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : null
  if (bpp === null) throw new Error(`仅支持 RGB/RGBA（colorType=${colorType}）`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(width * height * 4)
  const prev = Buffer.alloc(stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? line[x - bpp] : 0
      const up = prev[x]
      const upLeft = x >= bpp ? prev[x - bpp] : 0
      let v = line[x]
      if (filter === 1) v = (v + left) & 0xff
      else if (filter === 2) v = (v + up) & 0xff
      else if (filter === 3) v = (v + ((left + up) >> 1)) & 0xff
      else if (filter === 4) v = (v + paeth(left, up, upLeft)) & 0xff
      else if (filter !== 0) throw new Error(`未知 PNG 过滤器 ${filter}`)
      line[x] = v
    }
    for (let x = 0; x < width; x++) {
      const src = x * bpp
      const dst = (y * width + x) * 4
      out[dst] = line[src]
      out[dst + 1] = line[src + 1]
      out[dst + 2] = line[src + 2]
      out[dst + 3] = bpp === 4 ? line[src + 3] : 255
    }
    line.copy(prev)
  }
  return { width, height, data: out }
}

export function diffPixels(a, b, { perChannel = 16 } = {}) {
  if (a.width !== b.width || a.height !== b.height) return { dimensionMismatch: true, diffPixels: a.width * a.height, total: a.width * a.height, ratio: 1 }
  let diff = 0
  const limit = perChannel * perChannel * 3
  const n = a.data.length
  for (let i = 0; i < n; i += 4) {
    const dr = a.data[i] - b.data[i]
    const dg = a.data[i + 1] - b.data[i + 1]
    const db = a.data[i + 2] - b.data[i + 2]
    const da = a.data[i + 3] - b.data[i + 3]
    if ((dr * dr + dg * dg + db * db) > limit || Math.abs(da) > 16) diff++
  }
  const total = a.width * a.height
  return { dimensionMismatch: false, diffPixels: diff, total, ratio: diff / total }
}
