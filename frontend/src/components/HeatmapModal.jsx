import { useEffect } from 'react'
import MeasureHeatmap from './MeasureHeatmap'
import './HeatmapModal.css'

export default function HeatmapModal({ stats, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="hm-backdrop" onClick={onClose}>
      <div className="hm-panel" onClick={(e) => e.stopPropagation()}>

        <div className="hm-header">
          <span className="hm-title">Statystyki ćwiczeń</span>
          <button className="hm-close" onClick={onClose} title="Zamknij (Esc)">✕</button>
        </div>

        <div className="hm-body">
          <MeasureHeatmap
            totalBars={stats.total_bars}
            measureHeat={stats.measure_heat ?? {}}
            totalSessions={stats.total_sessions}
            totalSeconds={stats.total_seconds}
            bestBpmPercent={stats.best_bpm_percent}
            coveragePercent={stats.coverage_percent}
          />
        </div>

      </div>
    </div>
  )
}
