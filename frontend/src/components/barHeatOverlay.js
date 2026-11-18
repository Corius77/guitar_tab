// Kolorowanie taktów bezpośrednio na tabulaturze — warstwa <div>ów
// pozycjonowanych po współrzędnych z alphaTabowego boundsLookup.
//
// Dlaczego imperatywnie, a nie przez React: warstwa musi żyć w tym samym
// kontenerze co render alphaTab i przeliczać się po każdym renderFinished
// (zmiana szerokości okna → inny podział na systemy → inne bounds).
// React nie ma tu czego trzymać — DOM i tak należy do alphaTab.
//
// Współrzędne: alphaTab wstawia swój `.at-cursors` jako pierwsze dziecko
// kontenera i pozycjonuje kursor taktu surowymi wartościami z
// `masterBarBounds.visualBounds`. Wstawiamy warstwę tak samo (position:
// absolute, bez left/top, jako pierwsze dziecko), więc dzielimy z kursorem
// dokładnie ten sam układ współrzędnych — bez żadnej matematyki na offsetach.

import { rampColorCss } from '../utils/practiceHeat'

const LAYER_CLASS = 'at-bar-heat'

// Intensywność ćwiczeń niesie odcień (czerwień → bursztyn → zieleń) —
// rzadko ćwiczony takt ma być tak samo widoczny jak oklepany, tylko
// innego koloru.
//
// Kolory idą BEZ alfy, czyli dokładnie takie jak na pasku legendy
// "rzadko → często". Da się tak, bo warstwa leży na `mix-blend-mode:
// multiply` (patrz .at-bar-heat w CSS): mnożenie zachowuje pełne
// nasycenie, a czytelność gwarantuje samo z siebie — czarna nuta razy
// cokolwiek dalej jest czarna. Alfa tylko rozmywałaby barwy w papier
// i rozjeżdżała je z legendą.

// Wspólny mechanizm dla warstw "coś na każdym takcie": heat i zakres pętli.
// `cellFor(numerTaktu)` zwraca { style, className } albo null (nie maluj).
function paintBarLayer(container, layerClass, boundsLookup, cellFor) {
  if (!container) return
  if (!boundsLookup || !cellFor) {
    clearBarLayer(container, layerClass)
    return
  }

  let layer = container.querySelector(`:scope > .${layerClass}`)
  if (!layer) {
    layer = document.createElement('div')
    layer.className = layerClass
    container.insertBefore(layer, container.firstChild)
  }

  const frag = document.createDocumentFragment()
  for (const system of boundsLookup.staffSystems ?? []) {
    for (const barBounds of system.bars ?? []) {
      // index w boundsLookup jest 0-based, takty w UI liczymy od 1
      const spec = cellFor(barBounds.index + 1)
      if (!spec) continue

      const b = barBounds.visualBounds
      const cell = document.createElement('div')
      cell.className = spec.className
      cell.style.left = `${b.x}px`
      cell.style.top = `${b.y}px`
      cell.style.width = `${b.w}px`
      cell.style.height = `${b.h}px`
      if (spec.background) cell.style.background = spec.background
      frag.appendChild(cell)
    }
  }

  layer.replaceChildren(frag)
}

function clearBarLayer(container, layerClass) {
  container?.querySelector(`:scope > .${layerClass}`)?.remove()
}

export function clearBarHeat(container) {
  clearBarLayer(container, LAYER_CLASS)
}

/**
 * @param container element, na którym siedzi AlphaTabApi (nasz containerRef)
 * @param boundsLookup api.renderer.boundsLookup po renderFinished
 * @param intensityAt (numer taktu 1-based) → 0–1; 0 = nie maluj
 * @param markCold takty z 0 kreskuj jako nieruszone (zamiast zostawiać puste)
 */
export function paintBarHeat(container, boundsLookup, intensityAt, markCold = false) {
  paintBarLayer(container, LAYER_CLASS, boundsLookup, intensityAt && ((bar) => {
    const t = intensityAt(bar)
    if (t > 0) return { className: 'at-bar-heat-cell', background: rampColorCss(t) }
    // Nigdy niegrany takt — kreskowanie, żeby nietknięta reszta utworu
    // rzucała się w oczy tak samo jak oklepane fragmenty
    return markCold ? { className: 'at-bar-heat-cell at-bar-heat-cell--cold' } : null
  }))
}

// ── Zakres pętli ──────────────────────────────────────────────────────────
// alphaTab ma własne podświetlenie playbackRange (.at-selection), ale znika
// gdy pętla jest wyłączona — a zaznaczony zakres chcemy widzieć cały czas.
// Rysujemy więc sami: przygaszony gdy pętla stoi, wyraźny gdy gra.
const LOOP_LAYER_CLASS = 'at-loop-range'

export function paintLoopRange(container, boundsLookup, start, end, on) {
  const show = start != null && end != null && start <= end
  paintBarLayer(container, LOOP_LAYER_CLASS, boundsLookup, show && ((bar) => {
    if (bar < start || bar > end) return null
    const edges = (bar === start ? ' at-loop-range-cell--first' : '') + (bar === end ? ' at-loop-range-cell--last' : '')
    return { className: `at-loop-range-cell${on ? ' at-loop-range-cell--on' : ''}${edges}` }
  }))
}

// ── Notatki do taktów ─────────────────────────────────────────────────────
// Karteczka w lewym górnym rogu taktu, ucięta do jego szerokości; pełny tekst
// w tooltipie. Klik otwiera edycję — alphaTab łapie mousedown w fazie capture
// na kontenerze, więc to onBeatDown w playerze ignoruje kliki w .at-bar-note
// (stopPropagation tutaj nic by nie dało).
const NOTES_LAYER_CLASS = 'at-bar-notes'
export const BAR_NOTE_CLASS = 'at-bar-note'

export function paintBarNotes(container, boundsLookup, notes, onOpen) {
  if (!container) return
  const has = notes && Object.keys(notes).length > 0
  if (!boundsLookup || !has) {
    clearBarLayer(container, NOTES_LAYER_CLASS)
    return
  }

  let layer = container.querySelector(`:scope > .${NOTES_LAYER_CLASS}`)
  if (!layer) {
    layer = document.createElement('div')
    layer.className = NOTES_LAYER_CLASS
    container.insertBefore(layer, container.firstChild)
  }

  const frag = document.createDocumentFragment()
  for (const system of boundsLookup.staffSystems ?? []) {
    for (const barBounds of system.bars ?? []) {
      const bar = barBounds.index + 1
      const text = notes[bar]
      if (!text) continue
      const b = barBounds.visualBounds
      const el = document.createElement('div')
      el.className = BAR_NOTE_CLASS
      el.textContent = text
      el.title = `Takt ${bar}: ${text}\n(klik — edytuj)`
      el.style.left = `${b.x + 2}px`
      el.style.top = `${b.y}px`
      el.style.maxWidth = `${Math.max(24, b.w - 6)}px`
      el.addEventListener('click', () => onOpen?.(bar))
      frag.appendChild(el)
    }
  }
  layer.replaceChildren(frag)
}
