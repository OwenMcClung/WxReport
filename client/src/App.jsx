import { useState, useRef, useCallback, useEffect } from 'react'
import { compressImage } from './compressImage'
import { extractExif } from './exif'
import './App.css'

const TEST_MODE = import.meta.env.VITE_TEST_MODE ?? 'false'
const TWEET_LIMIT = 280

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

export default function App() {
  const [phase, setPhase] = useState('idle')
  // idle | preview | error
  const [photo, setPhoto] = useState(null)   // { file, url }
  const [coords, setCoords] = useState(null)
  const [locationStatus, setLocationStatus] = useState('idle') // idle | waiting | ready | error
  const [tweetText, setTweetText] = useState('')
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
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lon, timestamp, testMode: TEST_MODE }),
        })
        if (!res.ok) throw new Error(`server ${res.status}`)
        const data = await res.json()
        if (!cancelled) setTweetText(data.tweetText ?? '')
      } catch {
        if (!cancelled) {
          setTweetText(`📍 ${lat.toFixed(4)}, ${lon.toFixed(4)}\n🕒 ${timestamp}\n@NWS #wxreport`)
        }
      }
    })()
    return () => { cancelled = true }
  }, [photo, coords])

  const reset = useCallback(() => {
    if (photoUrlRef.current) {
      URL.revokeObjectURL(photoUrlRef.current)
      photoUrlRef.current = null
    }
    setPhoto(null)
    setCoords(null)
    setLocationStatus('idle')
    setTweetText('')
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

  async function handlePhotoSelect(e) {
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
    setPhoto({ file: finalFile, url, exif })
  }

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
  const fullTweet = composeTweet(note, tweetText)
  const remaining = TWEET_LIMIT - fullTweet.length
  // -1 reserves the newline between note and auto block when note is non-empty.
  const maxNoteLength = Math.max(0, TWEET_LIMIT - (tweetText ? tweetText.length + 1 : 0))
  const overLimit = remaining < 0

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">⛈</span>
        <h1>QuickReport</h1>
      </header>

      <main className="app-main">
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
              {tweetText
                ? <p>{tweetText}</p>
                : <p className="loading-text">
                    {awaitingLocation ? 'Getting your location…' : 'Generating tweet…'}
                  </p>
              }
            </div>

            {tweetText && (
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

            {locationStatus === 'error' && !tweetText && (
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
                disabled={!photo || overLimit || (!tweetText && locationStatus !== 'error')}
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
        onChange={handlePhotoSelect}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoSelect}
      />
    </div>
  )
}
