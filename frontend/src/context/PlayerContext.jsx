import { createContext, useContext, useRef, useState, useCallback } from 'react'

// Most między AlphaTabPlayer (gra wewnątrz głównego obszaru) a Sidebarem.
// Player wrzuca tu listę sekcji aktualnie otwartej tabulatury oraz funkcję
// seekToBar; sidebar je odczytuje, by pokazać klikalne sekcje.
const PlayerContext = createContext(null)

export function PlayerProvider({ children }) {
  // [{ bar: number (1-indexed), label: string }]
  const [sections, setSections] = useState([])
  const seekToBarRef = useRef(null)

  const registerSeek = useCallback((fn) => { seekToBarRef.current = fn }, [])
  const seekToBar = useCallback((bar) => { seekToBarRef.current?.(bar) }, [])
  const clearPlayer = useCallback(() => {
    setSections([])
    seekToBarRef.current = null
  }, [])

  return (
    <PlayerContext.Provider value={{ sections, setSections, registerSeek, seekToBar, clearPlayer }}>
      {children}
    </PlayerContext.Provider>
  )
}

// Zwraca {} gdy brak providera — bezpieczne destrukturyzowanie.
export const usePlayer = () => useContext(PlayerContext) || {}
