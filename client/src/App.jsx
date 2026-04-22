import { useState, useRef, useCallback, useEffect } from 'react'
import { compressImage } from './compressImage'
import { extractExif } from './exif'
import './App.css'

const TEST_MODE = import.meta.env.VITE_TEST_MODE ?? 'false'
const TWEET_LIMIT = 280
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

function cardinal8(deg) {
  if (!Number.isFinite(deg)) return null
  return DIRS[Math.round(deg / 45) % 8]
}

function buildAutoBlock(preview, direction) {
  if (!preview) return ''
  const { location, coords, officeHandle, timestamp } = preview
  const facing = direction ? ` · facing ${direction}` : ''
  const tsLine = timestamp ? `🕒 ${timestamp}\n` : ''
  return `📍 ${location} ${coords}${facing}\n${tsLine}${officeHandle} #wxreport`
}

function composeTweet(note, autoBlock) {
  const n = (note ?? '').trim()
  if (!autoBlock) return n
  return n ? `${n}\n${autoBlock}` : autoBlock
}

function formatLocal(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function geoErrorMessage(err) {
  if (!err) return 'Could not get your location.'
  switch (err.code) {
    case 1: return 'Location permission denied. Enable it in your browser settings.'
    case 2: return 'Location unavailable. Make sure GPS is on.'
    case 3: return 'Location request timed out. Try again.'
    default: return err.message || 'Could not get your location.'
  }
}

// iOS 13+ requires DeviceOrientationEvent.requestPermission() to be called
// while user-activation is still "hot" (within ~5s of a tap). We kick this
// off from the Take Photo button click — NOT from the file-input change
// handler, because by the time the user finishes taking a photo the original
// activation has expired. Result is cached so we prompt at most once per
// session.
let orientationPermission = null
function ensureOrientationPermission() {
  if (orientationPermission) return orientationPermission
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    orientationPermission = DeviceOrientationEvent.requestPermission()
      .then(r => r === 'granted')
      .catch(() => false)
  } else {
    orientationPermission = Promise.resolve(true)
  }
  return orientationPermission
}

// Grabs a single compass reading. Caller must have ensured permission first.
// Returns degrees 0-360 or null.
async function sampleCompass(timeoutMs = 2000) {
  const granted = await ensureOrientationPermission()
  if (!granted) return null
  return new Promise(resolve => {
    let settled = false
    const finish = v => {
      if (settled) return
      settled = true
      window.removeEventListener('deviceorientationabsolute', handler)
      window.removeEventListener('deviceorientation', handler)
      clearTimeout(timer)
      resolve(v)
    }
    const handler = e => {
      const h = e.webkitCompassHeading ?? (typeof e.alpha === 'number' ? (360 - e.alpha) % 360 : null)
      if (Number.isFinite(h)) finish(h)
    }
    window.addEventListener('deviceorientationabsolute', handler)
    window.addEventListener('deviceorientation', handler)
    const timer = setTimeout(() => finish(null), timeoutMs)
  })
}

function initialPhase() {
  try {
    const needsPrompt = typeof DeviceOrientationEvent?.requestPermission === 'function'
    const asked = localStorage.getItem('qr_permissions_asked') === '1'
    return needsPrompt && !asked ? 'permissions' : 'idle'
  } catch {
    return 'idle'
  }
}

export default function App() {
  const [phase, setPhase] = useState(initialPhase)
  // permissions | idle | preview | error
  const [photo, setPhoto] = useState(null)   // { file, url, exif }
  const [coords, setCoords] = useState(null)
  const [locationStatus, setLocationStatus] = useState('idle') // idle | waiting | ready | error
  const [preview, setPreview] = useState(null) // { location, coords, officeHandle, timestamp, heading }
  const [direction, setDirection] = useState(null)
  const [note, setNote] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [shareStatus, setShareStatus] = useState('') // '' | 'shared' | 'copied'
  const cameraRef = useRef(null)
  const libraryRef = useRef(null)
  const photoUrlRef = useRef(null)

  useEffect(() => () => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
  }, [])

  // Prefer EXIF data from the photo itself; fall back to live GPS and
  // file.lastModified. Fires as soon as some coords source is available.
  useEffect(() => {
    if (!photo) return
    const lat = photo.exif?.lat ?? coords?.lat
    const lon = photo.exif?.lon ?? coords?.lon
    if (lat == null || lon == null) return
    const timestamp = photo.exif?.timestamp ?? formatLocal(new Date(photo.file.lastModified || Date.now()))
    const heading = photo.exif?.heading
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lon, timestamp, heading, testMode: TEST_MODE }),
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) throw new Error(`server ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        setPreview(data)
        setDirection(prev => prev ?? cardinal8(data.heading))
      } catch {
        if (!cancelled) {
          setPreview({
            location: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
            coords: '',
            officeHandle: '@NWS',
            timestamp,
            heading,
          })
          setDirection(prev => prev ?? cardinal8(heading))
        }
      }
    })()
    return () => { cancelled = true }
  }, [photo, coords])

  async function handleGrantPermissions() {
    try { await ensureOrientationPermission() } catch { /* ignore */ }
    try { localStorage.setItem('qr_permissions_asked', '1') } catch { /* ignore */ }
    setPhase('idle')
  }

  const reset = useCallback(() => {
    if (photoUrlRef.current) {
      URL.revokeObjectURL(photoUrlRef.current)
      photoUrlRef.current = null
    }
    setPhoto(null)
    setCoords(null)
    setLocationStatus('idle')
    setPreview(null)
    setDirection(null)
    setNote('')
    setErrorMsg('')
    setShareStatus('')
    setPhase('idle')
    if (cameraRef.current) cameraRef.current.value = ''
    if (libraryRef.current) libraryRef.current.value = ''
  }, [])

  // CRITICAL: must run synchronously inside the button click (no awaits before
  // the file input click), otherwise iOS Safari strips the user-gesture and
  // the camera/picker won't open.
  function startReport(source) {
    setLocationStatus('waiting')
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude })
          setLocationStatus('ready')
        },
        err => {
          setLocationStatus('error')
          setErrorMsg(geoErrorMessage(err))
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      )
    } else {
      setLocationStatus('error')
      setErrorMsg('Geolocation is not supported in this browser.')
    }

    const ref = source === 'camera' ? cameraRef : libraryRef
    ref.current?.click()
  }

  async function handlePhotoSelect(e, source) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhase('preview')

    // Read EXIF from the raw file — canvas re-encoding below strips it.
    const exif = await extractExif(file)

    let finalFile = file
    try {
      finalFile = await compressImage(file)
    } catch { /* keep original */ }

    const url = URL.createObjectURL(finalFile)
    photoUrlRef.current = url

    // iOS strips heading from camera-captured files for privacy. Sample the
    // device compass on return as the best available proxy. Skip for library
    // uploads where EXIF heading either exists or isn't the user's current
    // orientation anyway.
    let heading = exif.heading
    if (heading == null && source === 'camera') {
      heading = await sampleCompass()
    }

    setPhoto({ file: finalFile, url, exif: { ...exif, heading: heading ?? exif.heading } })
  }

  const autoBlock = buildAutoBlock(preview, direction)
  const fullTweet = composeTweet(note, autoBlock)

  async function handleShare() {
    const shareData = { text: fullTweet, files: [photo.file] }

    if (navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData)
        setShareStatus('shared')
        return
      } catch (err) {
        if (err.name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(fullTweet)
      setShareStatus('copied')
    } catch {
      setErrorMsg('Sharing not supported. Copy the tweet text manually.')
      setPhase('error')
    }
  }

  const hasCoords = coords != null || photo?.exif?.lat != null
  const awaitingLocation = phase === 'preview' && !hasCoords && locationStatus !== 'error'
  const remaining = TWEET_LIMIT - fullTweet.length
  // -1 reserves the newline between note and auto block when note is non-empty.
  const maxNoteLength = Math.max(0, TWEET_LIMIT - (autoBlock ? autoBlock.length + 1 : 0))
  const overLimit = remaining < 0

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">⛈</span>
        <h1>QuickReport</h1>
      </header>

      <main className="app-main">
        {phase === 'permissions' && (
          <div className="screen screen-permissions">
            <p className="tagline">
              Allow motion &amp; orientation access so QuickReport can
              record which way you were facing when you take a photo.
            </p>
            <button className="btn btn-primary btn-giant" onClick={handleGrantPermissions}>
              Grant Permissions
            </button>
          </div>
        )}

        {phase === 'idle' && (
          <div className="screen screen-idle">
            <p className="tagline">Spot something? Report it instantly.</p>
            <button className="btn btn-primary btn-giant" onClick={() => startReport('camera')}>
              <span className="btn-icon">📸</span>
              Take Photo
            </button>
            <button className="btn btn-ghost btn-wide" onClick={() => startReport('library')}>
              <span className="btn-icon">🖼️</span>
              Upload from Library
            </button>
          </div>
        )}

        {phase === 'preview' && (
          <div className="screen screen-preview">
            <div className="photo-wrap">
              {photo
                ? <img src={photo.url} alt="Weather photo" />
                : <div className="photo-placeholder"><div className="spinner" /></div>
              }
            </div>

            <div className="tweet-preview">
              {preview ? (
                <p>
                  {`📍 ${preview.location}${preview.coords ? ` ${preview.coords}` : ''}`}
                  {direction && (
                    <>
                      {' · facing '}
                      <select
                        className="dir-select"
                        value={direction}
                        onChange={e => setDirection(e.target.value)}
                        aria-label="Camera heading"
                      >
                        {DIRS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </>
                  )}
                  {preview.timestamp && `\n🕒 ${preview.timestamp}`}
                  {`\n${preview.officeHandle} #wxreport`}
                </p>
              ) : (
                <p className="loading-text">
                  {awaitingLocation ? 'Getting your location…' : 'Generating tweet…'}
                </p>
              )}
            </div>

            {preview && (
              <div className="note-field">
                <textarea
                  className="note-input"
                  placeholder="Add details (optional) — e.g. what you're seeing"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  maxLength={maxNoteLength}
                  rows={2}
                />
                <div className={`note-counter${remaining < 20 ? ' warn' : ''}${overLimit ? ' over' : ''}`}>
                  {remaining} / {TWEET_LIMIT}
                </div>
              </div>
            )}

            {locationStatus === 'error' && !preview && (
              <div className="share-hint">⚠️ {errorMsg} You can still share the photo without location.</div>
            )}
            {shareStatus === 'shared' && (
              <div className="share-hint success">✓ Opened in share sheet — finish the post to publish.</div>
            )}
            {shareStatus === 'copied' && (
              <div className="share-hint">📋 Text copied. Open X, attach the photo, paste and post.</div>
            )}

            <div className="preview-actions">
              <button
                className="btn btn-primary"
                onClick={handleShare}
                disabled={!photo || overLimit || (!preview && locationStatus !== 'error')}
              >
                Share to X
              </button>
              <button className="btn btn-ghost" onClick={reset}>
                {shareStatus ? 'Done' : 'Retake'}
              </button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="screen screen-error">
            <span className="error-icon">⚠️</span>
            <p>{errorMsg}</p>
            <button className="btn btn-primary" onClick={reset}>
              Try Again
            </button>
          </div>
        )}
      </main>

      {/* Two hidden inputs: one forces the camera, one opens the library */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => handlePhotoSelect(e, 'camera')}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => handlePhotoSelect(e, 'library')}
      />
    </div>
  )
}
