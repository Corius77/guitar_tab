import { useEffect } from 'react'
import './KeyboardShortcutsModal.css'

const SHORTCUTS = [
  {
    id: 'playback',
    group: 'Odtwarzanie',
    icon: '▶',
    items: [
      { keys: ['Space'], label: 'Play / Pause' },
      { keys: ['S'], label: 'Stop' },
    ],
  },
  {
    id: 'tempo',
    group: 'Tempo',
    icon: '♩',
    items: [
      { keys: ['='], label: 'BPM +5' },
      { keys: ['+'], label: 'BPM +1' },
      { keys: ['-'], label: 'BPM −5' },
      { keys: ['_'], label: 'BPM −1' },
      { keys: ['R'], label: 'Reset tempa' },
    ],
  },
  {
    id: 'volume',
    group: 'Głośność',
    icon: '🔊',
    items: [
      { keys: ['↑'], label: 'Głośność +5%' },
      { keys: ['↓'], label: 'Głośność −5%' },
    ],
  },
  {
    id: 'metronome',
    group: 'Metronom',
    icon: '🥁',
    items: [
      { keys: ['M'], label: 'Włącz / wyłącz' },
    ],
  },
  {
    id: 'video',
    group: 'Wideo',
    icon: '📺',
    items: [
      { keys: ['V'], label: 'Pokaż / ukryj wideo' },
    ],
  },
  {
    id: 'loop',
    group: 'Pętla',
    icon: '🔁',
    items: [
      { keys: ['L'], label: 'Włącz / wyłącz pętlę' },
      { keys: ['X'], label: 'Wyczyść pętlę' },
      { keys: ['['], label: 'Takt startowy −1' },
      { keys: [']'], label: 'Takt startowy +1' },
      { keys: ['{'], label: 'Takt końcowy −1' },
      { keys: ['}'], label: 'Takt końcowy +1' },
    ],
  },
]

function Key({ label }) {
  return <kbd className="ks-key">{label}</kbd>
}

export default function KeyboardShortcutsModal({ onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="ks-backdrop" onClick={onClose}>
      <div className="ks-panel" onClick={(e) => e.stopPropagation()}>

        <div className="ks-header">
          <span className="ks-title">Skróty klawiszowe</span>
          <button className="ks-close" onClick={onClose} title="Zamknij (Esc)">✕</button>
        </div>

        <div className="ks-grid">
          {SHORTCUTS.map(({ id, group, icon, items }) => (
            <div key={id} className="ks-section">
              <div className="ks-section-header">
                <span className="ks-section-icon">{icon}</span>
                <span className="ks-section-title">{group}</span>
              </div>
              <ul className="ks-list">
                {items.map(({ keys, label }, i) => (
                  <li key={i} className="ks-item">
                    <span className="ks-label">{label}</span>
                    <span className="ks-keys">
                      {keys.map((k, ki) => <Key key={ki} label={k} />)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="ks-footer">
          Skróty działają gdy żadne pole tekstowe nie jest aktywne &nbsp;·&nbsp; <Key label="?" /> otwiera to okno
        </div>

      </div>
    </div>
  )
}
