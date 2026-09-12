import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeRiffs } from '../utils/riffAnalysis'
import { IconClose, IconLoop } from './icons'
import './RiffsModal.css'

// Miniatura riffu — render pierwszego wystąpienia taktu przez alphaTab
// (sama tabulatura, bez playera). Instancja tworzona leniwie, dopiero gdy
// kafelek wjedzie w widok modala (IntersectionObserver), i niszczona przy
// odmontowaniu — dzięki temu długa lista riffów nie zamula otwarcia.
function RiffSnippet({ score, trackIndex, bar, preview }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !score) return
    let api = null
    let cancelled = false

    const init = async () => {
      const { AlphaTabApi } = await import('@coderline/alphatab')
      if (cancelled || !ref.current) return
      api = new AlphaTabApi(ref.current, {
        core: { useWorkers: false, enableLazyLoading: false },
        player: { enablePlayer: false },
        display: {
          layoutMode: 0,
          staveProfile: 3, // sama tabulatura — jak dolna pięciolinia w playerze
          scale: 0.9,
          startBar: bar,   // 1-indexed
          barCount: 1,
        },
        notation: {
          elements: {
            scoreTitle: false, scoreSubTitle: false, scoreArtist: false,
            scoreAlbum: false, scoreWords: false, scoreMusic: false,
            scoreWordsAndMusic: false, scoreCopyright: false,
            guitarTuning: false, trackNames: false, chordDiagrams: false,
            effectMarker: false,
          },
        },
      })
      api.renderScore(score, [trackIndex])
    }

    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        io.disconnect()
        init()
      }
    })
    io.observe(el)

    return () => {
      cancelled = true
      io.disconnect()
      try { api?.destroy() } catch {}
    }
  }, [score, trackIndex, bar])

  return <div className="rf-snippet" ref={ref} title={preview} />
}

// Modal analizy riffów: grupuje identyczne takty, pokazuje ile razy się
// powtarzają i które riffy są do siebie podobne (minimalne warianty).
// Klik w zakres taktów → ustawia pętlę na ten zakres (onSelectRange).
export default function RiffsModal({ score, initialTrackIndex, onClose, onSelectRange }) {
  const tracks = score?.tracks ?? []
  const [trackIndex, setTrackIndex] = useState(
    initialTrackIndex != null && initialTrackIndex < tracks.length ? initialTrackIndex : 0
  )

  // Kopia partytury dla miniatur. Oryginalny Score jest cały czas w użyciu
  // przez grającą instancję playera — równoległy render tego samego obiektu
  // przez kilkanaście instancji potrafi dawać przekłamane takty.
  const [snippetScore, setSnippetScore] = useState(null)
  useEffect(() => {
    let cancelled = false
    setSnippetScore(null)
    if (!score) return
    import('@coderline/alphatab').then(({ model }) => {
      if (cancelled) return
      try {
        const clone = model.JsonConverter.jsonToScore(model.JsonConverter.scoreToJson(score))
        setSnippetScore(clone)
      } catch {
        setSnippetScore(score) // awaryjnie: renderuj z oryginału
      }
    })
    return () => { cancelled = true }
  }, [score])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const analysis = useMemo(
    () => analyzeRiffs(score, trackIndex),
    [score, trackIndex]
  )

  // id grupy → lista { other, similarity, viaShape } (obustronnie)
  const similarByGroup = useMemo(() => {
    const map = {}
    if (!analysis) return map
    for (const { a, b, similarity, viaShape } of analysis.similar) {
      ;(map[a] = map[a] || []).push({ other: b, similarity, viaShape })
      ;(map[b] = map[b] || []).push({ other: a, similarity, viaShape })
    }
    for (const list of Object.values(map)) {
      list.sort((x, y) => y.similarity - x.similarity)
    }
    return map
  }, [analysis])

  // Rodziny podobieństwa — spójne komponenty na parach z analysis.similar
  // (union-find). Riffy z jednej rodziny to warianty tego samego motywu.
  const families = useMemo(() => {
    if (!analysis) return []
    const parent = {}
    const find = (x) => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] }
      return x
    }
    for (const { a, b } of analysis.similar) {
      if (!(a in parent)) parent[a] = a
      if (!(b in parent)) parent[b] = b
      parent[find(a)] = find(b)
    }
    const byRoot = new Map()
    for (const idKey of Object.keys(parent)) {
      const id = Number(idKey)
      const root = find(id)
      if (!byRoot.has(root)) byRoot.set(root, [])
      byRoot.get(root).push(id)
    }
    const groupById = new Map(analysis.groups.map(g => [g.id, g]))
    return [...byRoot.values()]
      .map(ids => {
        // Warianty w rodzinie chronologicznie — od najwcześniejszego wystąpienia
        const members = ids.map(id => groupById.get(id)).filter(Boolean)
          .sort((a, b) => a.bars[0] - b.bars[0])
        return {
          members,
          totalCount: members.reduce((s, g) => s + g.count, 0),
          firstBar: Math.min(...members.map(g => g.bars[0])),
        }
      })
  }, [analysis])

  if (!analysis) return null

  // Riffy poza rodzinami: powtarzające się pokazujemy pojedynczo,
  // jednorazowe bez wariantów trafiają do jednej zbiorczej linijki.
  const inFamily = new Set(families.flatMap(f => f.members.map(g => g.id)))
  const singles = analysis.groups.filter(g => !inFamily.has(g.id) && g.count > 1)
  const hiddenCount = analysis.groups.length - inFamily.size - singles.length
  const nothingToShow = families.length === 0 && singles.length === 0

  // Jeden chronologiczny strumień: rodziny i pojedyncze riffy posortowane po
  // takcie najwcześniejszego wystąpienia w grupie.
  const items = [
    ...families.map(f => ({ type: 'family', firstBar: f.firstBar, family: f })),
    ...singles.map(g => ({ type: 'single', firstBar: g.bars[0], group: g })),
  ].sort((a, b) => a.firstBar - b.firstBar)

  const renderGroup = (g) => (
    <div key={g.id} className="rf-group" id={`rf-group-${g.id}`}>
      <div className="rf-group-head">
        <span className="rf-group-name">Riff {g.id}</span>
        <span className={`rf-group-count ${g.count > 1 ? 'rf-group-count--repeat' : ''}`}>
          {g.count > 1 ? `${g.count}× w utworze` : 'występuje raz'}
        </span>
      </div>

      <RiffSnippet score={snippetScore} trackIndex={trackIndex} bar={g.bars[0]} preview={g.preview} />

      <div className="rf-group-ranges">
        {g.ranges.map(([s, e]) => (
          <button
            key={`${s}-${e}`}
            className="rf-range-chip"
            onClick={() => onSelectRange?.(s, e)}
            title={`Zapętl takty ${s}–${e}`}
          >
            <IconLoop />
            {s === e ? `takt ${s}` : `takty ${s}–${e}`}
          </button>
        ))}
      </div>

      {similarByGroup[g.id] && (
        <div className="rf-group-similar">
          {similarByGroup[g.id].map(({ other, similarity, viaShape }) => (
            <button
              key={other}
              className={`rf-similar-chip ${viaShape ? 'rf-similar-chip--shape' : ''}`}
              title={viaShape
                ? 'Ten sam patent przesunięty na gryfie — przewiń do niego'
                : 'Minimalnie różniący się wariant — przewiń do niego'}
              onClick={() => document.getElementById(`rf-group-${other}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            >
              ≈ Riff {other} · {Math.round(similarity * 100)}%{viaShape ? ' kształt' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="rf-backdrop" onClick={onClose}>
      <div className="rf-panel" onClick={(e) => e.stopPropagation()}>

        <div className="rf-header">
          <span className="rf-title">Analiza riffów</span>
          {tracks.length > 1 ? (
            <select
              className="rf-track-select"
              value={trackIndex}
              onChange={(e) => setTrackIndex(parseInt(e.target.value, 10))}
            >
              {tracks.map((t, i) => (
                <option key={i} value={i}>{t.name || `Ścieżka ${i + 1}`}</option>
              ))}
            </select>
          ) : (
            <span className="rf-track-name">{analysis.trackName}</span>
          )}
          <button className="rf-close" onClick={onClose} title="Zamknij (Esc)"><IconClose /></button>
        </div>

        <div className="rf-summary">
          <div className="rf-stat">
            <span className="rf-stat-value">{analysis.uniqueCount}</span>
            <span className="rf-stat-label">unikalnych riffów</span>
          </div>
          <div className="rf-stat">
            <span className="rf-stat-value">{analysis.repeatedCount}</span>
            <span className="rf-stat-label">powtarza się</span>
          </div>
          <div className="rf-stat">
            <span className="rf-stat-value">{analysis.totalBars}</span>
            <span className="rf-stat-label">taktów</span>
          </div>
          {analysis.emptyBars > 0 && (
            <div className="rf-stat">
              <span className="rf-stat-value">{analysis.emptyBars}</span>
              <span className="rf-stat-label">pustych</span>
            </div>
          )}
        </div>

        <div className="rf-body">
          {nothingToShow && (
            <p className="rf-empty">Żaden takt się nie powtarza — każdy riff jest inny.</p>
          )}

          {/* Chronologicznie: rodziny wariantów (w ramce) i pojedyncze riffy,
              wg taktu najwcześniejszego wystąpienia w grupie */}
          {(() => {
            let familyIdx = 0
            return items.map(item => {
              if (item.type === 'single') return renderGroup(item.group)
              const fam = item.family
              const letter = String.fromCharCode(65 + (familyIdx++ % 26))
              return (
                <div key={fam.members[0].id} className="rf-family">
                  <div className="rf-family-head">
                    <span className="rf-family-badge">Motyw {letter}</span>
                    <span className="rf-family-info">
                      {fam.members.length} podobne warianty · łącznie {fam.totalCount}× w utworze · od taktu {fam.firstBar}
                    </span>
                  </div>
                  <div className="rf-family-grid">
                    {fam.members.map(renderGroup)}
                  </div>
                </div>
              )
            })
          })()}

          {hiddenCount > 0 && (
            <p className="rf-hidden-note">
              + {hiddenCount} {hiddenCount === 1 ? 'riff występujący' : 'riffów występujących'} tylko raz, bez podobnych wariantów
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
