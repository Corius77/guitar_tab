// Przester dla ścieżek z distortion guitar.
//
// alphaTab miksuje wszystkie kanały MIDI do jednego stereo streamu, więc nie da
// się wpiąć efektu na pojedynczą ścieżkę — cały synth ma jedno wyjście.
// Dlatego efekt idzie na master, ale włącza się TYLKO wtedy, gdy wszystko co
// aktualnie słychać to gitary z przesterem (czyli w praktyce: solo na takiej
// ścieżce, albo utwór złożony wyłącznie z takich ścieżek).

// GM program numbers (0-based): 29 = Overdriven Guitar, 30 = Distortion Guitar
export const DISTORTION_PROGRAMS = new Set([29, 30])

const PERCUSSION_CHANNEL = 9

export function isDistortionTrack(track) {
  const info = track?.playbackInfo
  if (!info) return false
  if (info.primaryChannel === PERCUSSION_CHANNEL) return false
  return DISTORTION_PROGRAMS.has(info.program)
}

export function hasDistortionTrack(score) {
  return !!score?.tracks?.some(isDistortionTrack)
}

// Które ścieżki faktycznie słychać. Solo = tylko wybrana, podkład = wszystkie
// poza wybraną, inaczej wszystkie (renderTracks zmienia tylko widok, dźwięk
// leci z całej partytury).
export function audibleTracks(score, soloOn, selectedIndex, backingOn = false) {
  const tracks = score?.tracks
  if (!tracks?.length) return []
  if (selectedIndex != null && tracks[selectedIndex]) {
    if (soloOn) return [tracks[selectedIndex]]
    if (backingOn) return tracks.filter((_, i) => i !== selectedIndex)
  }
  return [...tracks]
}

// Czy przester ma się teraz załączyć — wszystko słyszalne musi być przesterem,
// inaczej zabrudzilibyśmy bas i perkusję.
export function shouldEngageDistortion(score, soloOn, selectedIndex, backingOn = false) {
  const audible = audibleTracks(score, soloOn, selectedIndex, backingOn)
  if (!audible.length) return false
  return audible.every(isDistortionTrack)
}

// Węzeł wyjściowy syntezatora alphaTab. Pola są prywatne (implementacyjne),
// więc wszystko obudowane try/catch — brak węzła = po prostu bez efektu.
export function getSynthOutputNode(api) {
  try {
    const output = api?.player?.output
    if (!output) return null
    return output._worklet ?? output._audioNode ?? null
  } catch {
    return null
  }
}

export function getSynthAudioContext(api) {
  try {
    return api?.player?.output?.context ?? null
  } catch {
    return null
  }
}

// ── Krzywa waveshapera ─────────────────────────────────────────────────────
// Klasyczny soft-clip: im większe k, tym ostrzejsze ścięcie zbocza.
function makeCurve(amount) {
  const k = amount * 100
  const n = 8192
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
  }
  return curve
}

// drive 0..1 → parametry stopnia gainu i krzywej
function driveParams(drive) {
  const d = Math.max(0, Math.min(1, drive))
  return {
    preGain: 1 + d * 11,          // 1..12 — ile pchamy w waveshaper
    amount: 0.08 + d * 0.55,      // ostrość krzywej
    postGain: 0.5 / (1 + d * 1.6), // wyrównanie poziomu, żeby nie urywało głowy
  }
}

// Łańcuch: pre-gain → HP (odchudza dół przed clipem) → waveshaper →
// LP + peak (namiastka symulacji kolumny) → makeup gain.
export function createDistortionChain(ctx, drive) {
  const input = ctx.createGain()
  const highpass = ctx.createBiquadFilter()
  const shaper = ctx.createWaveShaper()
  const lowpass = ctx.createBiquadFilter()
  const presence = ctx.createBiquadFilter()
  const output = ctx.createGain()

  highpass.type = 'highpass'
  highpass.frequency.value = 90

  shaper.oversample = '4x'

  lowpass.type = 'lowpass'
  lowpass.frequency.value = 5200

  presence.type = 'peaking'
  presence.frequency.value = 1800
  presence.Q.value = 0.9
  presence.gain.value = 4

  input.connect(highpass)
  highpass.connect(shaper)
  shaper.connect(lowpass)
  lowpass.connect(presence)
  presence.connect(output)

  const setDrive = (value) => {
    const { preGain, amount, postGain } = driveParams(value)
    input.gain.value = preGain
    shaper.curve = makeCurve(amount)
    output.gain.value = postGain
  }
  setDrive(drive)

  const dispose = () => {
    for (const node of [input, highpass, shaper, lowpass, presence, output]) {
      try { node.disconnect() } catch {}
    }
  }

  return { input, output, setDrive, dispose }
}
