// ── Recorder: WebM/Opus (MediaRecorder) + WAV (Web Audio capture) ──────────
//
// Każdy starter zwraca obiekt z metodą `stop()`, która rozwiązuje się do:
//   { blob, mimeType, durationSeconds, format }
// Wszystko działa offline, w przeglądarce.

const WEBM_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
]

function pickWebmMime() {
  if (typeof MediaRecorder === 'undefined') return null
  for (const m of WEBM_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return null
}

export async function getAudioInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter(d => d.kind === 'audioinput')
}

export async function getStreamForDevice(deviceId) {
  const constraints = {
    audio: deviceId
      ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  }
  return navigator.mediaDevices.getUserMedia(constraints)
}

// ── WebM/Opus przez MediaRecorder ───────────────────────────────────────────
export function startWebmRecorder(stream, { bitsPerSecond = 192000 } = {}) {
  const mimeType = pickWebmMime()
  if (!mimeType) throw new Error('Przeglądarka nie wspiera nagrywania WebM/Opus')

  const chunks = []
  const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: bitsPerSecond })
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }

  const startedAt = performance.now()
  recorder.start(250) // emit chunks every 250 ms

  return {
    stop() {
      return new Promise((resolve, reject) => {
        recorder.onerror = (e) => reject(e.error || new Error('MediaRecorder error'))
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType })
          resolve({
            blob,
            mimeType,
            durationSeconds: (performance.now() - startedAt) / 1000,
            format: 'webm',
          })
        }
        try { recorder.stop() } catch (err) { reject(err) }
      })
    },
  }
}

// ── WAV (PCM 16-bit) przez Web Audio ────────────────────────────────────────
// Używa ScriptProcessorNode (deprecated, ale wciąż działa wszędzie i jest
// dużo prostszy niż AudioWorklet dla nagrywania off-line).
export function startWavRecorder(stream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) throw new Error('Brak Web Audio API')

  const ctx = new AudioCtx()
  const source = ctx.createMediaStreamSource(stream)
  const bufferSize = 4096
  const processor = ctx.createScriptProcessor(bufferSize, 1, 1)
  const chunks = []

  processor.onaudioprocess = (e) => {
    // Kopia, bo bufor zostaje nadpisany w kolejnej klatce
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
  }

  source.connect(processor)
  // ScriptProcessor musi być podłączony do destination, by w ogóle odpalać callback.
  // Tworzymy "wycisz" — gain 0 do destination, żeby nagrywany sygnał nie wracał do głośników.
  const silenceGain = ctx.createGain()
  silenceGain.gain.value = 0
  processor.connect(silenceGain)
  silenceGain.connect(ctx.destination)

  const sampleRate = ctx.sampleRate
  const startedAt = performance.now()

  return {
    stop() {
      try { processor.disconnect() } catch {}
      try { source.disconnect() } catch {}
      try { silenceGain.disconnect() } catch {}
      const blob = encodeWavMono16(chunks, sampleRate)
      const result = {
        blob,
        mimeType: 'audio/wav',
        durationSeconds: (performance.now() - startedAt) / 1000,
        format: 'wav',
      }
      ctx.close().catch(() => {})
      return Promise.resolve(result)
    },
  }
}

function encodeWavMono16(floatChunks, sampleRate) {
  const totalSamples = floatChunks.reduce((s, c) => s + c.length, 0)
  const dataBytes = totalSamples * 2          // 16-bit
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  // RIFF
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  // fmt
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)           // PCM chunk size
  view.setUint16(20, 1, true)            // PCM format
  view.setUint16(22, 1, true)            // 1 kanał
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true)            // block align
  view.setUint16(34, 16, true)           // bits/sample
  // data
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  // float32 → int16 LE
  let offset = 44
  for (const chunk of floatChunks) {
    for (let i = 0; i < chunk.length; i++) {
      let s = chunk[i]
      if (s > 1) s = 1
      else if (s < -1) s = -1
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      offset += 2
    }
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}
