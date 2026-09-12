// ── Analiza riffów ──────────────────────────────────────────────────────────
// Działa na modelu partytury alphaTab (score.tracks[].staves[].bars[]).
// Każdy takt zamieniany jest na sekwencję tokenów (rytm + struna/próg +
// techniki). Identyczne sekwencje → jeden riff. Podobieństwo między riffami
// liczone jest znormalizowanym dystansem Levenshteina na tokenach, więc
// riffy różniące się np. jedną nutą wychodzą jako "warianty".

// Limit bezpieczeństwa dla porównań parami (O(n²) × Levenshtein).
const MAX_GROUPS_FOR_SIMILARITY = 250

function noteToken(n) {
  let flags = ''
  if (n.isTieDestination) flags += '~'
  if (n.isDead) flags += 'x'
  if (n.isPalmMute) flags += 'm'
  if (n.hammerPullOrigin) flags += 'h'
  if (n.slideOutType) flags += `so${n.slideOutType}`
  if (n.slideInType) flags += `si${n.slideInType}`
  if (n.harmonicType) flags += `H${n.harmonicType}`
  if (n.bendPoints && n.bendPoints.length > 0) flags += 'b'

  // Instrumenty strunowe: pozycja struna/próg. Fallback (perkusja itd.):
  // wysokość MIDI, żeby analiza dalej miała sens.
  const pos = typeof n.string === 'number' && typeof n.fret === 'number' && n.fret >= 0
    ? `${n.string}/${n.fret}`
    : `p${n.realValue ?? '?'}`
  return pos + flags
}

// Czytelny podgląd taktu: progi kolejnych bitów, akordy w nawiasach, pauzy jako "·".
function beatPreview(beat) {
  if (beat.isRest) return '·'
  const frets = beat.notes.map(n =>
    typeof n.fret === 'number' && n.fret >= 0
      ? (n.isDead ? 'x' : String(n.fret))
      : '?'
  )
  return frets.length > 1 ? `(${frets.join(' ')})` : frets[0] ?? '?'
}

// "Kształtowy" token nuty — próg liczony względem najniższego progu na tej
// samej strunie w takcie. Dzięki temu riff przesunięty na gryfie (np. pedał
// na 8 progu vs pusta struna) ma identyczny kształt i grupuje się jako wariant.
function noteShapeToken(n, baseByLine) {
  let flags = ''
  if (n.isTieDestination) flags += '~'
  if (n.isDead) flags += 'x'
  if (n.isPalmMute) flags += 'm'
  if (n.hammerPullOrigin) flags += 'h'
  if (n.slideOutType) flags += `so${n.slideOutType}`
  if (n.slideInType) flags += `si${n.slideInType}`
  if (n.harmonicType) flags += `H${n.harmonicType}`
  if (n.bendPoints && n.bendPoints.length > 0) flags += 'b'

  if (typeof n.string === 'number' && typeof n.fret === 'number' && n.fret >= 0) {
    return `${n.string}Δ${n.fret - (baseByLine.get(`s${n.string}`) ?? 0)}` + flags
  }
  const v = n.realValue ?? 0
  return `pΔ${v - (baseByLine.get('p') ?? 0)}` + flags
}

function tokenizeBar(bar) {
  const tokens = []
  const shapeTokens = []
  const preview = []
  let hasNotes = false

  // Baza dla kształtu: najniższy próg na każdej strunie w tym takcie
  // (i najniższa wysokość MIDI dla nut bez struny).
  const baseByLine = new Map()
  for (const voice of bar.voices ?? []) {
    if (voice.isEmpty) continue
    for (const beat of voice.beats ?? []) {
      for (const n of beat.notes ?? []) {
        const key = typeof n.string === 'number' && typeof n.fret === 'number' && n.fret >= 0
          ? `s${n.string}` : 'p'
        const val = key === 'p' ? (n.realValue ?? 0) : n.fret
        const curr = baseByLine.get(key)
        if (curr == null || val < curr) baseByLine.set(key, val)
      }
    }
  }

  for (const voice of bar.voices ?? []) {
    if (voice.isEmpty) continue
    for (const beat of voice.beats ?? []) {
      const rhythm = `${beat.duration}.${beat.dots || 0}` +
        (beat.tupletNumerator > 0 && beat.tupletNumerator !== -1 && beat.tupletDenominator > 0 &&
         !(beat.tupletNumerator === 1 && beat.tupletDenominator === 1)
          ? `t${beat.tupletNumerator}:${beat.tupletDenominator}`
          : '')
      if (beat.isRest || !beat.notes?.length) {
        tokens.push(`R${rhythm}`)
        shapeTokens.push(`R${rhythm}`)
        preview.push('·')
        continue
      }
      // Takt "gra" tylko gdy jest w nim nowe uderzenie — same nuty przewiązane
      // z poprzedniego taktu (tie destination) to wybrzmiewanie, nie riff.
      if (beat.notes.some(n => !n.isTieDestination)) hasNotes = true
      const notes = beat.notes.map(noteToken).sort().join(',')
      tokens.push(`${rhythm}:${notes}`)
      const shapeNotes = beat.notes.map(n => noteShapeToken(n, baseByLine)).sort().join(',')
      shapeTokens.push(`${rhythm}:${shapeNotes}`)
      preview.push(beatPreview(beat))
    }
    tokens.push('|') // separator głosów
    shapeTokens.push('|')
  }

  return { tokens, shapeTokens, preview: preview.join(' '), hasNotes }
}

// Znormalizowane podobieństwo (1 = identyczne) na tablicach tokenów.
function tokenSimilarity(a, b) {
  const n = a.length
  const m = b.length
  if (n === 0 && m === 0) return 1
  // Szybkie odrzucenie: zbyt różne długości nie mogą być podobne.
  const maxLen = Math.max(n, m)
  if (Math.abs(n - m) / maxLen > 0.5) return 0

  let prev = new Array(m + 1)
  let curr = new Array(m + 1)
  for (let j = 0; j <= m; j++) prev[j] = j
  for (let i = 1; i <= n; i++) {
    curr[0] = i
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return 1 - prev[m] / maxLen
}

// [1,2,3,7,9,10] → [[1,3],[7,7],[9,10]]
function toRanges(sortedBars) {
  const ranges = []
  for (const bar of sortedBars) {
    const last = ranges[ranges.length - 1]
    if (last && bar === last[1] + 1) last[1] = bar
    else ranges.push([bar, bar])
  }
  return ranges
}

// Główna funkcja. Zwraca null gdy brak ścieżki.
// {
//   trackName, totalBars, emptyBars, uniqueCount, repeatedCount,
//   groups: [{ id, count, bars, ranges, preview, tokens }],  // wg liczby wystąpień
//   similar: [{ a, b, similarity }],                          // pary id grup, malejąco
// }
export function analyzeRiffs(score, trackIndex, { similarityThreshold = 0.7, shapeThreshold = 0.85 } = {}) {
  const track = score?.tracks?.[trackIndex]
  if (!track?.staves?.length) return null

  const barCount = track.staves[0].bars?.length ?? 0
  const bars = []
  for (let i = 0; i < barCount; i++) {
    let tokens = []
    let shapeTokens = []
    let preview = ''
    let hasNotes = false
    for (const stave of track.staves) {
      const bar = stave.bars?.[i]
      if (!bar) continue
      const r = tokenizeBar(bar)
      tokens = tokens.concat(r.tokens)
      shapeTokens = shapeTokens.concat(r.shapeTokens)
      if (!preview && r.hasNotes) preview = r.preview
      hasNotes = hasNotes || r.hasNotes
    }
    bars.push({ tokens, shapeTokens, key: tokens.join(' '), preview, hasNotes })
  }

  // Grupuj identyczne takty (puste/pauzowe pomijamy — to nie riffy)
  const byKey = new Map()
  bars.forEach((b, i) => {
    if (!b.hasNotes) return
    let g = byKey.get(b.key)
    if (!g) {
      g = { tokens: b.tokens, shapeTokens: b.shapeTokens, preview: b.preview, bars: [] }
      byKey.set(b.key, g)
    }
    g.bars.push(i + 1)
  })

  const groups = [...byKey.values()]
    .sort((a, b) => b.bars.length - a.bars.length || a.bars[0] - b.bars[0])
    .map((g, idx) => ({
      id: idx + 1,
      count: g.bars.length,
      bars: g.bars,
      ranges: toRanges(g.bars),
      preview: g.preview,
      tokens: g.tokens,
      shapeTokens: g.shapeTokens,
    }))

  // Dwa kryteria podobieństwa:
  // 1. dosłowne — te same progi z drobnymi różnicami (próg similarityThreshold),
  // 2. kształtowe — ten sam ruch po gryfie, ale przesunięty (np. inna nuta
  //    pedałowa); tu wymagamy więcej (shapeThreshold), bo metryka jest luźniejsza.
  const similar = []
  if (groups.length <= MAX_GROUPS_FOR_SIMILARITY) {
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const simRaw = tokenSimilarity(groups[i].tokens, groups[j].tokens)
        const simShape = tokenSimilarity(groups[i].shapeTokens, groups[j].shapeTokens)
        if (simRaw >= similarityThreshold || simShape >= shapeThreshold) {
          similar.push({
            a: groups[i].id,
            b: groups[j].id,
            similarity: Math.max(simRaw, simShape),
            viaShape: simShape > simRaw && simRaw < similarityThreshold,
          })
        }
      }
    }
    similar.sort((x, y) => y.similarity - x.similarity)
  }

  return {
    trackName: track.name || `Ścieżka ${trackIndex + 1}`,
    totalBars: barCount,
    emptyBars: bars.filter(b => !b.hasNotes).length,
    uniqueCount: groups.length,
    repeatedCount: groups.filter(g => g.count > 1).length,
    groups,
    similar,
  }
}
