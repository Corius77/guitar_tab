// Wspólna logika "jak dawno ćwiczyłem ten takt" — używana przez heatmapę
// w modalu statystyk i przez kolorowanie taktów na samej tabulaturze.
// Obie muszą liczyć świeżość identycznie, inaczej te same dane wyglądałyby
// inaczej w dwóch miejscach.

export const DEFAULT_RECENT_DAYS = 30

// Ile przejść przez takt daje pełną intensywność (szczyt skali).
// Skala nie jest czysto względna: samo normalizowanie do rekordu w utworze
// sprawiało, że jedno przegranie całości — każdy takt po razie — od razu
// barwiło wszystko na maksa. Dopiero gdy któryś takt przekroczy ten próg,
// rolę szczytu przejmuje rekord, więc dalej widać, co ćwiczone najwięcej.
export const FULL_HEAT_PLAYS = 12

/** Mianownik skali intensywności: próg albo rekord utworu — co większe. */
export function heatScale(maxPlays) {
  return Math.max(FULL_HEAT_PLAYS, maxPlays || 0)
}

// Minimalna świeżość dla taktu ćwiczonego, ale poza oknem —
// żeby "dawno temu" dało się odróżnić od "nigdy".
export const STALE_FLOOR = 0.12

/** Ile pełnych dni minęło od daty ISO. null = brak daty / śmieci. */
export function daysSince(iso) {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - then.getTime()) / 86400000))
}

/** Świeżość 0–1: 1 = dziś, STALE_FLOOR = dawno, 0 = nigdy. */
export function freshnessFromDays(days, recentDays = DEFAULT_RECENT_DAYS) {
  if (days == null) return 0
  return Math.max(STALE_FLOOR, 1 - days / recentDays)
}

export function formatDaysAgo(days) {
  if (days == null) return 'niećwiczony'
  if (days === 0) return 'dziś'
  if (days === 1) return 'wczoraj'
  return `${days} dni temu`
}

/** Odczyt z mapy takt → wartość (klucze z API przychodzą jako stringi). */
export function pickMeasure(map, m) {
  if (!map) return null
  return map[m] ?? map[String(m)] ?? null
}

// ── Rampa ──────────────────────────────────────────────────────────────────
// Wartość niesie ODCIEŃ, nie jasność: 1 = zieleń, 0 = czerwień, po drodze
// bursztyn. Dzięki temu alfa może zostać stała i słaby takt jest tak samo
// widoczny jak mocny — po prostu innego koloru.
//
// Ta sama rampa obsługuje dwa różne znaczenia, zależnie od miejsca:
//   • ślady na tabulaturze i tryb "Intensywność" — 1 = dużo ćwiczony
//   • tryb "Ostatnio" w modalu                   — 1 = ćwiczony dziś
// Stąd neutralne nazwy: rampa nie wie, co mierzy.
const RAMP_STOPS = [
  [0.000, [214,  40,  32]], // czerwień
  [0.533, [240, 130,  20]], // pomarańcz
  [0.767, [222, 194,  26]], // żółć
  [1.000, [ 40, 168,  64]], // zieleń
]

/** Wartość 0–1 → [r, g, b] wg rampy. */
export function rampColor(t) {
  const f = Math.max(0, Math.min(1, t))
  let lo = RAMP_STOPS[0]
  let hi = RAMP_STOPS[RAMP_STOPS.length - 1]
  for (let i = 0; i < RAMP_STOPS.length - 1; i++) {
    if (f >= RAMP_STOPS[i][0] && f <= RAMP_STOPS[i + 1][0]) {
      lo = RAMP_STOPS[i]
      hi = RAMP_STOPS[i + 1]
      break
    }
  }
  const span = hi[0] - lo[0]
  const k = span > 0 ? (f - lo[0]) / span : 0
  return [0, 1, 2].map(i => Math.round(lo[1][i] + k * (hi[1][i] - lo[1][i])))
}

/** Jak wyżej, ale gotowy CSS. `alpha` pominięta → nieprzezroczysty rgb(). */
export function rampColorCss(t, alpha) {
  const [r, g, b] = rampColor(t)
  return alpha == null ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Gradient CSS tej samej rampy — do legend (od lewej: 0 → 1). */
export const RAMP_GRADIENT_CSS = `linear-gradient(90deg, ${
  RAMP_STOPS.map(([t]) => rampColorCss(t)).join(', ')
})`

/**
 * Buduje funkcję takt → intensywność 0–1: ile RAZEM razy takt był grany
 * (zwykłe przejścia i pętle liczą się tak samo), w skali `heatScale` — czyli
 * do FULL_HEAT_PLAYS przejść, a przy solidnie zaharowanym utworze do jego
 * rekordu. 0 = nigdy.
 *
 * `liveCounts` to mapa takt → liczba przejść z TRWAJĄCEJ sesji. Nie ma ich
 * jeszcze w bazie, a mają się doliczać od razu, żeby feedback był
 * natychmiastowy — dlatego wchodzą też do maksimum, inaczej bieżące przejścia
 * wypchnęłyby wynik poza 1.
 */
export function makeIntensityAt(stats, liveCounts) {
  const heat = stats?.measure_heat

  const totalAt = (bar) =>
    Number(pickMeasure(heat, bar) ?? 0) + (liveCounts?.get(bar) ?? 0)

  const bars = new Set([
    ...Object.keys(heat ?? {}).map(Number),
    ...(liveCounts ? liveCounts.keys() : []),
  ])
  let max = 1
  for (const bar of bars) max = Math.max(max, totalAt(bar))
  const scale = heatScale(max)

  return (bar) => {
    const total = totalAt(bar)
    return total <= 0 ? 0 : Math.min(1, total / scale)
  }
}
