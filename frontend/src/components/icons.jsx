// Zestaw ikon SVG zastępujący emotki w całej aplikacji.
// Wszystkie dziedziczą kolor (currentColor) i skalują się z font-size (1em),
// więc wpasowują się w istniejące style (kolor tekstu, rozmiar nagłówka itd.).

function Svg({ children, viewBox = '0 0 24 24', style, ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ verticalAlign: '-0.125em', flexShrink: 0, ...style }}
      {...rest}
    >
      {children}
    </svg>
  )
}

// ── Transport ────────────────────────────────────────────────────────────────
export const IconPlay = (p) => (
  <Svg fill="currentColor" stroke="none" {...p}>
    <polygon points="7 4 20 12 7 20" />
  </Svg>
)
export const IconPause = (p) => (
  <Svg fill="currentColor" stroke="none" {...p}>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </Svg>
)
export const IconStop = (p) => (
  <Svg fill="currentColor" stroke="none" {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </Svg>
)

// ── Marka / muzyka ───────────────────────────────────────────────────────────
export const IconGuitar = (p) => (
  <Svg {...p}>
    <circle cx="8.5" cy="15.5" r="5.6" />
    <circle cx="8.5" cy="15.5" r="1.9" />
    <line x1="12.5" y1="11.5" x2="20" y2="4" />
    <line x1="18.4" y1="2.4" x2="21.6" y2="5.6" />
  </Svg>
)
export const IconMusicNote = (p) => (
  <Svg {...p}>
    <circle cx="7" cy="17" r="3" fill="currentColor" stroke="none" />
    <path d="M10 17V4c3 .5 4.5 2 4.5 5" />
  </Svg>
)

// ── Nawigacja / akcje ──────────────────────────────────────────────────────
export const IconSearch = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.5" y2="16.5" />
  </Svg>
)
export const IconPlus = (p) => (
  <Svg {...p}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Svg>
)
export const IconClose = (p) => (
  <Svg {...p}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </Svg>
)
export const IconChevronLeft = (p) => (
  <Svg {...p}>
    <polyline points="15 18 9 12 15 6" />
  </Svg>
)
export const IconEdit = (p) => (
  <Svg {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Svg>
)
export const IconTrash = (p) => (
  <Svg {...p}>
    <polyline points="3 6 21 6" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M18 6l-1 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 6" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </Svg>
)

// ── Player / praktyka ───────────────────────────────────────────────────────
export const IconChartLine = (p) => (
  <Svg {...p}>
    <polyline points="3 16 9 10 13 14 21 6" />
    <polyline points="15 6 21 6 21 12" />
  </Svg>
)
export const IconChartBar = (p) => (
  <Svg {...p}>
    <line x1="4" y1="20" x2="20" y2="20" />
    <rect x="5.5" y="11" width="3" height="7" rx="0.5" fill="currentColor" stroke="none" />
    <rect x="10.5" y="6" width="3" height="12" rx="0.5" fill="currentColor" stroke="none" />
    <rect x="15.5" y="13" width="3" height="5" rx="0.5" fill="currentColor" stroke="none" />
  </Svg>
)
export const IconDrum = (p) => (
  <Svg {...p}>
    <ellipse cx="11" cy="9" rx="7" ry="2.5" />
    <path d="M4 9v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V9" />
    <line x1="13" y1="8" x2="20" y2="3" />
    <line x1="15" y1="9.5" x2="22" y2="5.5" />
  </Svg>
)
export const IconReset = (p) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <polyline points="21 3 21 9 15 9" />
  </Svg>
)
export const IconLoop = (p) => (
  <Svg {...p}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </Svg>
)
export const IconBookmark = (p) => (
  <Svg {...p}>
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
  </Svg>
)
export const IconVolume = (p) => (
  <Svg {...p}>
    <polygon points="4 9 8 9 12.5 5 12.5 19 8 15 4 15" fill="currentColor" />
    <path d="M16 9.5a4 4 0 0 1 0 5" />
    <path d="M18.5 7a7.5 7.5 0 0 1 0 10" />
  </Svg>
)
export const IconVideo = (p) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <polygon points="10 9 15.5 12 10 15" fill="currentColor" stroke="none" />
  </Svg>
)
export const IconMic = (p) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </Svg>
)
export const IconRecDot = (p) => (
  <Svg fill="currentColor" stroke="none" {...p}>
    <circle cx="12" cy="12" r="6" />
  </Svg>
)
export const IconTimer = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="8" />
    <line x1="12" y1="13" x2="12" y2="9" />
    <line x1="9" y1="2" x2="15" y2="2" />
    <line x1="12" y1="2" x2="12" y2="5" />
  </Svg>
)
export const IconFire = (p) => (
  <Svg fill="currentColor" stroke="none" {...p}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </Svg>
)

export const IconDownload = (p) => (
  <Svg {...p}>
    <path d="M12 4v11" />
    <polyline points="7 11 12 16 17 11" />
    <line x1="5" y1="20" x2="19" y2="20" />
  </Svg>
)

// ── Pliki ────────────────────────────────────────────────────────────────────
export const IconFile = (p) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <polyline points="14 3 14 8 19 8" />
  </Svg>
)
export const IconWarning = (p) => (
  <Svg {...p}>
    <path d="M12 3 2 20h20z" />
    <line x1="12" y1="9" x2="12" y2="14" />
    <circle cx="12" cy="17.2" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
)
