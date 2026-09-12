import { useEffect } from 'react'
import { IconPlay, IconMusicNote, IconVolume, IconDrum, IconVideo, IconLoop, IconClose } from './icons'
import './KeyboardShortcutsModal.css'

const SHORTCUTS = [
  {
    id: 'playback',
    group: 'Odtwarzanie',
    icon: <IconPlay />,
    items: [
      { keys: ['Space'], label: 'Play / Pause' },
      { keys: ['S'], label: 'Stop' },
      { keys: ['←'], label: 'Takt wstecz' },
      { keys: ['→'], label: 'Takt naprzód' },
      { keys: ['Shift', '←→'], label: 'Skok o 4 takty' },
      { keys: ['Home'], label: 'Początek pętli / utworu' },
    ],
  },
  {
    id: 'tempo',
    group: 'Tempo',
    icon: <IconMusicNote />,
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
    icon: <IconVolume />,
    items: [
      { keys: ['↑'], label: 'Głośność +5%' },
      { keys: ['↓'], label: 'Głośność −5%' },
      { keys: ['T'], label: 'Solo — tylko wybrana ścieżka' },
      { keys: ['B'], label: 'Podkład — wycisz wybraną ścieżkę' },
      { keys: ['D'], label: 'Przester (distortion guitar)' },
      { keys: ['H'], label: 'Ślady ćwiczeń — kolor taktów' },
    ],
  },
  {
    id: 'metronome',
    group: 'Metronom',
    icon: <IconDrum />,
    items: [
      { keys: ['M'], label: 'Włącz / wyłącz' },
    ],
  },
  {
    id: 'video',
    group: 'Wideo',
    icon: <IconVideo />,
    items: [
      { keys: ['V'], label: 'Pokaż / ukryj wideo' },
    ],
  },
  {
    id: 'loop',
    group: 'Pętla',
    icon: <IconLoop />,
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
          <button className="ks-close" onClick={onClose} title="Zamknij (Esc)"><IconClose /></button>
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
          <Key label="Esc" /> wychodzi z pola / zamyka okno &nbsp;·&nbsp; <Key label="?" /> otwiera to okno
        </div>

      </div>
    </div>
  )
}
