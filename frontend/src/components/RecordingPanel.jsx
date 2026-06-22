import { useEffect, useRef, useState, useCallback } from 'react'
import './RecordingPanel.css'
import {
  getAudioInputDevices,
  getStreamForDevice,
  startWebmRecorder,
  startWavRecorder,
} from '../audio/recorder'
import { getRecordings, uploadRecording, deleteRecording } from '../api/practice'

const LS_DEVICE_KEY = 'guitarTab.recDeviceId'
const LS_FORMAT_KEY = 'guitarTab.recFormat'

export default function RecordingPanel({
  songId,
  user,
  bpmPercent,
  onStartPlayback,
  onStopPlayback,
  disabled,
}) {
  const [open, setOpen] = useState(false)
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem(LS_DEVICE_KEY) || '')
  const [format, setFormat] = useState(() => localStorage.getItem(LS_FORMAT_KEY) || 'webm')

  // 'idle' | 'starting' | 'recording' | 'uploading'
  const [state, setState] = useState('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [recordings, setRecordings] = useState([])

  const recorderRef = useRef(null)   // { stop() }
  const streamRef = useRef(null)
  const elapsedTimerRef = useRef(null)
  const startedAtRef = useRef(0)

  // Załaduj listę nagrań przy mount/zmianie songId
  useEffect(() => {
    if (!user || !songId) return
    getRecordings(songId)
      .then(({ data }) => setRecordings(data))
      .catch(() => {})
  }, [user, songId])

  // Załaduj listę urządzeń wejściowych (po zgodzie na mic)
  const loadDevices = useCallback(async () => {
    try {
      const list = await getAudioInputDevices()
      setDevices(list)
      // Jeśli zapisane urządzenie nie istnieje, użyj pierwszego
      if (deviceId && !list.find(d => d.deviceId === deviceId)) {
        setDeviceId(list[0]?.deviceId || '')
      }
    } catch (e) {
      setError(`Nie udało się pobrać urządzeń: ${e.message}`)
    }
  }, [deviceId])

  useEffect(() => {
    if (!open) return
    loadDevices()
    const onChange = () => loadDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange)
  }, [open, loadDevices])

  // Zapis preferencji
  useEffect(() => { if (deviceId) localStorage.setItem(LS_DEVICE_KEY, deviceId) }, [deviceId])
  useEffect(() => { localStorage.setItem(LS_FORMAT_KEY, format) }, [format])

  // Sprzątanie przy unmount
  useEffect(() => () => {
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }, [])

  const cleanup = () => {
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    recorderRef.current = null
  }

  const start = async () => {
    if (state !== 'idle') return
    setError('')
    setState('starting')
    try {
      const stream = await getStreamForDevice(deviceId || undefined)
      streamRef.current = stream

      // Odśwież listę urządzeń teraz, gdy mamy zgodę na labels
      if (!devices.length || !devices[0]?.label) loadDevices()

      const recorder = format === 'wav' ? startWavRecorder(stream) : startWebmRecorder(stream)
      recorderRef.current = recorder

      startedAtRef.current = performance.now()
      setElapsed(0)
      elapsedTimerRef.current = setInterval(() => {
        setElapsed((performance.now() - startedAtRef.current) / 1000)
      }, 200)
      setState('recording')

      // Synchronizacja: po starcie nagrywania włącz playback utworu
      try { onStartPlayback?.() } catch {}
    } catch (e) {
      setError(`Nie udało się rozpocząć nagrywania: ${e.message}`)
      cleanup()
      setState('idle')
    }
  }

  const stop = async () => {
    if (state !== 'recording') return
    setState('uploading')
    try { onStopPlayback?.() } catch {}
    try {
      const result = await recorderRef.current.stop()
      cleanup()

      const fd = new FormData()
      const ext = result.format === 'wav' ? 'wav' : 'webm'
      const filename = `rec-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`
      fd.append('file', result.blob, filename)
      fd.append('format', result.format)
      fd.append('mime_type', result.mimeType)
      fd.append('duration_seconds', String(result.durationSeconds.toFixed(2)))
      fd.append('size_bytes', String(result.blob.size))
      if (bpmPercent != null) fd.append('bpm_percent', String(bpmPercent))

      const { data } = await uploadRecording(songId, fd)
      setRecordings(prev => [data, ...prev])
      setState('idle')
      setElapsed(0)
    } catch (e) {
      setError(`Błąd zapisu: ${e.response?.data?.detail || e.message}`)
      cleanup()
      setState('idle')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Usunąć nagranie?')) return
    try {
      await deleteRecording(id)
      setRecordings(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      setError(`Nie udało się usunąć: ${e.message}`)
    }
  }

  if (!user) return null

  const fmtTime = (s) => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }
  const fmtSize = (b) => {
    if (!b) return ''
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <>
      <button
        className={`at-rec-toggle ${open ? 'at-rec-toggle--open' : ''} ${state === 'recording' ? 'at-rec-toggle--recording' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Nagrywanie"
        disabled={disabled}
      >🎙{recordings.length > 0 && <span className="at-rec-count">{recordings.length}</span>}</button>

      {open && (
        <div className="at-rec-panel">
          <div className="at-rec-header">
            <strong>Nagrywanie</strong>
            <button className="at-rec-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="at-rec-row">
            <label className="at-rec-label">Wejście audio</label>
            <select
              className="at-rec-select"
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
              disabled={state !== 'idle'}
            >
              {devices.length === 0 && <option value="">— (kliknij REC by autoryzować) —</option>}
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Urządzenie ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          </div>

          <div className="at-rec-row">
            <label className="at-rec-label">Format</label>
            <div className="at-rec-format">
              <label className="at-rec-radio">
                <input
                  type="radio"
                  name="rec-format"
                  value="webm"
                  checked={format === 'webm'}
                  onChange={() => setFormat('webm')}
                  disabled={state !== 'idle'}
                />
                <span>WebM/Opus <small>(mały)</small></span>
              </label>
              <label className="at-rec-radio">
                <input
                  type="radio"
                  name="rec-format"
                  value="wav"
                  checked={format === 'wav'}
                  onChange={() => setFormat('wav')}
                  disabled={state !== 'idle'}
                />
                <span>WAV <small>(lossless)</small></span>
              </label>
            </div>
          </div>

          <div className="at-rec-row at-rec-actions">
            {state === 'idle' && (
              <button className="at-rec-btn at-rec-btn--start" onClick={start}>
                ● REC
              </button>
            )}
            {state === 'starting' && (
              <button className="at-rec-btn" disabled>Start…</button>
            )}
            {state === 'recording' && (
              <>
                <button className="at-rec-btn at-rec-btn--stop" onClick={stop}>
                  ■ STOP
                </button>
                <span className="at-rec-elapsed">⬤ {fmtTime(elapsed)}</span>
              </>
            )}
            {state === 'uploading' && (
              <button className="at-rec-btn" disabled>Zapisuję…</button>
            )}
          </div>

          {error && <p className="at-rec-error">{error}</p>}

          <div className="at-rec-list-wrap">
            <div className="at-rec-list-title">Nagrania ({recordings.length})</div>
            {recordings.length === 0 ? (
              <p className="at-rec-empty">Brak nagrań dla tego utworu.</p>
            ) : (
              <ul className="at-rec-list">
                {recordings.map(r => (
                  <li key={r.id} className="at-rec-item">
                    <div className="at-rec-item-meta">
                      <span className="at-rec-item-date">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                      <span className="at-rec-item-tags">
                        {r.format?.toUpperCase()}
                        {r.duration_seconds != null && ` · ${fmtTime(r.duration_seconds)}`}
                        {r.bpm_percent != null && ` · ${Math.round(r.bpm_percent)}%`}
                        {r.size_bytes != null && ` · ${fmtSize(r.size_bytes)}`}
                      </span>
                    </div>
                    {r.file_url && (
                      <audio className="at-rec-item-audio" src={r.file_url} controls preload="none" />
                    )}
                    <div className="at-rec-item-actions">
                      {r.file_url && (
                        <a className="at-rec-item-link" href={r.file_url} download target="_blank" rel="noreferrer">⤓</a>
                      )}
                      <button className="at-rec-item-del" onClick={() => handleDelete(r.id)} title="Usuń">🗑</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}
