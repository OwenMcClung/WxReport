import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { getNWSOfficeHandle } from './nwsOffices.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const clientDist = join(__dirname, '..', 'client', 'dist')
const hasClientBuild = existsSync(clientDist)

const app = express()
const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173'
app.use(cors({ origin: allowedOrigin }))
app.use(express.json())

const SETTLEMENT_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood'])
const CARDINALS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const toRad = d => d * Math.PI / 180

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2)
  const Δλ = toRad(lon2 - lon1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function cardinal8(deg) {
  return CARDINALS_8[Math.round(deg / 45) % 8]
}

function stateCode(address) {
  const iso = address['ISO3166-2-lvl4']
  if (typeof iso === 'string' && iso.startsWith('US-')) return iso.slice(3)
  return address.state ?? null
}

async function geocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=12`,
      {
        headers: { 'User-Agent': 'QuickReport/1.0 (badbrick602@gmail.com)' },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) throw new Error(`Nominatim ${res.status}`)
    const data = await res.json()
    const a = data.address ?? {}
    const town = a.city ?? a.town ?? a.village ?? a.hamlet
    const state = stateCode(a)

    if (town && state && SETTLEMENT_TYPES.has(data.addresstype)) {
      const fLat = Number(data.lat), fLon = Number(data.lon)
      if (Number.isFinite(fLat) && Number.isFinite(fLon)) {
        const miles = haversineMiles(lat, lon, fLat, fLon)
        if (miles < 1) return `${town}, ${state}`
        const dir = cardinal8(bearingDeg(fLat, fLon, lat, lon))
        return `${Math.round(miles)} miles ${dir} of ${town}, ${state}`
      }
    }

    if (town && state) return `${town}, ${state}`
    if (town) return town
    if (state) return state
    return null
  } catch {
    return null
  }
}

async function resolveOfficeHandle(lat, lon, testMode) {
  if (testMode) return '@McclungOwen'
  try {
    return await getNWSOfficeHandle(lat, lon)
  } catch {
    return '@NWS'
  }
}

function parseCoords(body) {
  const lat = Number(body.lat)
  const lon = Number(body.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { lat, lon }
}

if (!hasClientBuild) {
  app.get('/', (_req, res) => {
    res.json({ service: 'QuickReport', status: 'ready' })
  })
}

function sanitizeTimestamp(s) {
  if (typeof s !== 'string') return null
  const cleaned = s.replace(/[\r\n]/g, '').trim().slice(0, 32)
  return cleaned || null
}

app.post('/api/preview', async (req, res) => {
  const coords = parseCoords(req.body)
  if (!coords) return res.status(400).json({ error: 'Valid lat and lon required' })
  const timestamp = sanitizeTimestamp(req.body.timestamp)
  try {
    const [location, officeHandle] = await Promise.all([
      geocode(coords.lat, coords.lon),
      resolveOfficeHandle(coords.lat, coords.lon, req.body.testMode === 'true'),
    ])
    const locText = location ?? `${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`
    const coordText = `(${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)})`
    const tsLine = timestamp ? `🕒 ${timestamp}\n` : ''
    const tweetText = `📍 ${locText} ${coordText}\n${tsLine}${officeHandle} #wxreport`
    res.json({ tweetText, location: locText, officeHandle, timestamp })
  } catch (err) {
    console.error('Preview error:', err.message)
    res.status(500).json({ error: 'Failed to build preview' })
  }
})

if (hasClientBuild) {
  app.use(express.static(clientDist))
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n⛈  QuickReport server running on port ${PORT}`)
  console.log(`   CORS allows: ${allowedOrigin}`)
  console.log(`   Static client: ${hasClientBuild ? clientDist : 'disabled (dev mode)'}\n`)
})
