import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { getNWSOfficeHandle } from './nwsOffices.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const clientDist = join(__dirname, '..', 'client', 'dist')
const hasClientBuild = existsSync(clientDist)

const app = express()
const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173'
app.use(cors({ origin: allowedOrigin }))
app.use(express.json())

const places = JSON.parse(readFileSync(join(__dirname, 'usPlaces.json'), 'utf-8'))

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

// Scans the full GNIS populated-places list for the closest point using a
// planar approximation (fast, no trig). Accurate enough for nearest-neighbor
// within the contiguous US and territories.
function findNearestPlace(lat, lon) {
  const cosLat = Math.cos(toRad(lat))
  let bestIdx = -1
  let bestD2 = Infinity
  for (let i = 0; i < places.length; i++) {
    const p = places[i]
    const dLat = p[2] - lat
    const dLon = (p[3] - lon) * cosLat
    const d2 = dLat * dLat + dLon * dLon
    if (d2 < bestD2) {
      bestD2 = d2
      bestIdx = i
    }
  }
  if (bestIdx < 0) return null
  const p = places[bestIdx]
  return { name: p[0], state: p[1], lat: p[2], lon: p[3] }
}

function geocode(lat, lon) {
  const p = findNearestPlace(lat, lon)
  if (!p) return null
  const miles = haversineMiles(lat, lon, p.lat, p.lon)
  if (miles < 1) return `${p.name}, ${p.state}`
  const rounded = Math.round(miles)
  const dir = cardinal8(bearingDeg(p.lat, p.lon, lat, lon))
  return `${rounded} ${rounded === 1 ? 'mile' : 'miles'} ${dir} of ${p.name}, ${p.state}`
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
    res.json({ service: 'WXReport', status: 'ready' })
  })
}

function sanitizeTimestamp(s) {
  if (typeof s !== 'string') return null
  const cleaned = s.replace(/[\r\n]/g, '').trim().slice(0, 32)
  return cleaned || null
}

function parseHeading(h) {
  const n = Number(h)
  if (!Number.isFinite(n) || n < 0 || n >= 360) return null
  return n
}

app.post('/api/preview', async (req, res) => {
  const coords = parseCoords(req.body)
  if (!coords) return res.status(400).json({ error: 'Valid lat and lon required' })
  const timestamp = sanitizeTimestamp(req.body.timestamp)
  const heading = parseHeading(req.body.heading)
  try {
    const [location, officeHandle] = await Promise.all([
      geocode(coords.lat, coords.lon),
      resolveOfficeHandle(coords.lat, coords.lon, req.body.testMode === 'true'),
    ])
    const locText = location ?? `${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`
    const coordText = `(${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)})`
    res.json({ location: locText, coords: coordText, officeHandle, timestamp, heading })
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
  console.log(`\n⛈  WXReport server running on port ${PORT}`)
  console.log(`   CORS allows: ${allowedOrigin}`)
  console.log(`   Static client: ${hasClientBuild ? clientDist : 'disabled (dev mode)'}\n`)
})
