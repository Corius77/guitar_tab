// Odczyt metadanych z pliku Guitar Pro po stronie przeglądarki.
//
// Backend robi to samo przy zapisie (apps/songs/metadata.py), ale tam jest
// za późno na UX: chcemy pokazać tytuł i wykonawcę w formularzu od razu po
// wybraniu pliku, żeby dało się je poprawić przed wysłaniem.
//
// Używamy parsera alphaTab, a nie własnego — to ten sam kod, który potem
// renderuje tabulaturę, więc nie ma szans na rozjazd. Import jest leniwy,
// bo alphaTab waży ~1.2 MB i nie ma po co siedzieć w bundlu modala.

export async function readTabMetadata(file) {
  try {
    const { importer } = await import('@coderline/alphatab')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const score = importer.ScoreLoader.loadScoreFromBytes(bytes)
    return {
      title: (score?.title ?? '').trim(),
      artist: (score?.artist ?? '').trim(),
      album: (score?.album ?? '').trim(),
    }
  } catch {
    // Nieobsługiwany albo uszkodzony plik — formularz zostaje pusty,
    // a backend i tak spróbuje jeszcze raz przy zapisie.
    return null
  }
}
