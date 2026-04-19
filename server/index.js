import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { getNWSOfficeHandle } from './nwsOffices.js'

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

app.get('/', (_req, res) => {
  res.json({ service: 'QuickReport', status: 'ready' })
})

app.post('/api/preview', async (req, res) => {
  const coords = parseCoords(req.body)
  if (!coords) return res.status(400).json({ error: 'Valid lat and lon required' })
  try {
    const [location, officeHandle] = await Promise.all([
      geocode(coords.lat, coords.lon),
      resolveOfficeHandle(coords.lat, coords.lon, req.body.testMode === 'true'),
    ])
    const locText = location ?? `${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`
    const tweetText = `📍 ${locText} — ${officeHandle} #wxreport`
    res.json({ tweetText, location: locText, officeHandle })
  } catch (err) {
    console.error('Preview error:', err.message)
    res.status(500).json({ error: 'Failed to build preview' })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n⛈  QuickReport server running on port ${PORT}`)
  console.log(`   CORS allows: ${allowedOrigin}\n`)
})
