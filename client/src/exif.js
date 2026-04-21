// Minimal JPEG EXIF reader. Returns any of { lat, lon, timestamp, heading } that
// were found in the file; silently returns {} on anything malformed or missing.
// Timestamp is formatted "YYYY-MM-DD HH:MM" from EXIF DateTimeOriginal (local
// wall-clock time at capture — EXIF has no timezone).
// Heading is degrees 0-360 (camera direction / GPSImgDirection).
export async function extractExif(file) {
  try {
    const buf = await file.slice(0, 128 * 1024).arrayBuffer()
    const view = new DataView(buf)
    if (view.getUint16(0) !== 0xFFD8) return {}

    let offset = 2
    let tiffStart = -1
    while (offset < view.byteLength - 4) {
      if (view.getUint8(offset) !== 0xFF) break
      const marker = view.getUint8(offset + 1)
      const size = view.getUint16(offset + 2)
      if (size < 2) break
      if (
        marker === 0xE1 &&
        view.getUint32(offset + 4) === 0x45786966 && // "Exif"
        view.getUint16(offset + 8) === 0x0000
      ) {
        tiffStart = offset + 10
        break
      }
      offset += 2 + size
    }
    if (tiffStart < 0) return {}

    const bo = view.getUint16(tiffStart)
    const little = bo === 0x4949
    if (!little && bo !== 0x4D4D) return {}
    const u16 = o => view.getUint16(o, little)
    const u32 = o => view.getUint32(o, little)
    if (u16(tiffStart + 2) !== 0x002A) return {}

    const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 }

    const readEntries = ifdOff => {
      const out = {}
      if (ifdOff + 2 > view.byteLength) return out
      const count = u16(ifdOff)
      for (let i = 0; i < count; i++) {
        const e = ifdOff + 2 + i * 12
        if (e + 12 > view.byteLength) break
        out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), valueOff: e + 8 }
      }
      return out
    }

    const readValue = entry => {
      const { type, count, valueOff } = entry
      const bytes = (typeSize[type] ?? 1) * count
      const dataOff = bytes <= 4 ? valueOff : tiffStart + u32(valueOff)
      if (type === 2) {
        let s = ''
        for (let i = 0; i < count; i++) {
          const c = view.getUint8(dataOff + i)
          if (c === 0) break
          s += String.fromCharCode(c)
        }
        return s
      }
      if (type === 5) {
        const a = []
        for (let i = 0; i < count; i++) {
          const num = u32(dataOff + i * 8)
          const den = u32(dataOff + i * 8 + 4)
          a.push(den === 0 ? 0 : num / den)
        }
        return a
      }
      if (type === 3) return u16(dataOff)
      if (type === 4) return u32(dataOff)
      return null
    }

    const ifd0 = readEntries(tiffStart + u32(tiffStart + 4))
    const result = {}

    if (ifd0[0x8769]) {
      const exif = readEntries(tiffStart + u32(ifd0[0x8769].valueOff))
      const dt = exif[0x9003] && readValue(exif[0x9003])
      const m = typeof dt === 'string' && dt.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):\d{2}/)
      if (m) result.timestamp = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`
    }

    if (ifd0[0x8825]) {
      const gps = readEntries(tiffStart + u32(ifd0[0x8825].valueOff))
      const latRef = gps[0x0001] && readValue(gps[0x0001])
      const lat = gps[0x0002] && readValue(gps[0x0002])
      const lonRef = gps[0x0003] && readValue(gps[0x0003])
      const lon = gps[0x0004] && readValue(gps[0x0004])
      if (
        Array.isArray(lat) && lat.length === 3 &&
        Array.isArray(lon) && lon.length === 3 &&
        (latRef === 'N' || latRef === 'S') &&
        (lonRef === 'E' || lonRef === 'W')
      ) {
        const latDeg = lat[0] + lat[1] / 60 + lat[2] / 3600
        const lonDeg = lon[0] + lon[1] / 60 + lon[2] / 3600
        result.lat = latRef === 'S' ? -latDeg : latDeg
        result.lon = lonRef === 'W' ? -lonDeg : lonDeg
      }

      const dir = gps[0x0011] && readValue(gps[0x0011])
      const deg = Array.isArray(dir) ? dir[0] : dir
      if (Number.isFinite(deg) && deg >= 0 && deg < 360) result.heading = deg
    }

    return result
  } catch {
    return {}
  }
}
