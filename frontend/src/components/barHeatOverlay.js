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

export function clearBarHeat(container) {
  container?.querySelector(`:scope > .${LAYER_CLASS}`)?.remove()
}

/**
 * @param container element, na którym siedzi AlphaTabApi (nasz containerRef)
 * @param boundsLookup api.renderer.boundsLookup po renderFinished
 * @param intensityAt (numer taktu 1-based) → 0–1; 0 = nie maluj
 */
export function paintBarHeat(container, boundsLookup, intensityAt) {
  if (!container) return
  if (!boundsLookup || !intensityAt) {
    clearBarHeat(container)
    return
  }

  let layer = container.querySelector(`:scope > .${LAYER_CLASS}`)
  if (!layer) {
    layer = document.createElement('div')
    layer.className = LAYER_CLASS
    container.insertBefore(layer, container.firstChild)
  }

  const frag = document.createDocumentFragment()
  for (const system of boundsLookup.staffSystems ?? []) {
    for (const barBounds of system.bars ?? []) {
      // index w boundsLookup jest 0-based, takty w UI liczymy od 1
      const t = intensityAt(barBounds.index + 1)
      if (t <= 0) continue

      const b = barBounds.visualBounds
      const cell = document.createElement('div')
      cell.className = 'at-bar-heat-cell'
      cell.style.left = `${b.x}px`
      cell.style.top = `${b.y}px`
      cell.style.width = `${b.w}px`
      cell.style.height = `${b.h}px`
      cell.style.background = rampColorCss(t)
      frag.appendChild(cell)
    }
  }

  layer.replaceChildren(frag)
}
