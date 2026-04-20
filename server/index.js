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
    const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.county
    const state = a.state
    if (city && state) return `${city}, ${state}`
    if (city) return city
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
