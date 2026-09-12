"""Wyciąganie metadanych (tytuł / wykonawca / album) z plików Guitar Pro.

Bez zewnętrznych zależności — obsługiwane formaty rozbieramy sami:

* ``.gp`` (Guitar Pro 7/8) — kontener ZIP, w środku ``Content/score.gpif``
  czyli XML z elementem ``<Score>``. Trywialne.
* ``.gp3`` / ``.gp4`` / ``.gp5`` — format binarny. Po 31-bajtowym nagłówku
  wersji idzie ciąg pól tekstowych o stałej kolejności; nas interesują
  pierwsze cztery (tytuł, podtytuł, wykonawca, album).
* ``.gpx`` (Guitar Pro 6) — kontener BCFZ z własną kompresją. NIE jest
  obsługiwany; zwracamy pusty dict, wywołujący ma zostawić dane jak były.

Wszystko jest defensywne: uszkodzony albo nieznany plik nigdy nie wysadza
uploadu, tylko zwraca to, co udało się odczytać (możliwe, że nic).
"""

import logging
import os
import struct
import zipfile
from xml.etree import ElementTree

logger = logging.getLogger(__name__)

# Pola, które umiemy wyciągnąć — kolejność bez znaczenia, to tylko kontrakt.
METADATA_FIELDS = ('title', 'artist', 'album')

# GP3-5: nagłówek to bajt długości + 30 bajtów napisu wersji.
_GP345_HEADER_SIZE = 31
# Napisy w starych formatach są w cp1252, nie utf-8.
_GP345_ENCODING = 'cp1252'


def _clean(value):
    return (value or '').strip()


# ── Guitar Pro 7/8 (.gp) ────────────────────────────────────────────────────

def _extract_gp(fileobj):
    """Kontener ZIP → Content/score.gpif → <Score><Title>/<Artist>/<Album>."""
    with zipfile.ZipFile(fileobj) as archive:
        name = next((n for n in archive.namelist() if n.endswith('.gpif')), None)
        if name is None:
            return {}

        with archive.open(name) as handle:
            # iterparse zamiast wczytywania całości — score.gpif potrafi mieć
            # kilka MB nut, a <Score> siedzi na samym początku.
            for event, element in ElementTree.iterparse(handle, events=('end',)):
                if element.tag != 'Score':
                    continue
                return {
                    'title': _clean(element.findtext('Title')),
                    'artist': _clean(element.findtext('Artist')),
                    'album': _clean(element.findtext('Album')),
                }
    return {}


# ── Guitar Pro 3/4/5 (.gp3 / .gp4 / .gp5) ───────────────────────────────────

def _extract_gp345(fileobj):
    data = fileobj.read()
    if len(data) <= _GP345_HEADER_SIZE:
        return {}

    pos = _GP345_HEADER_SIZE

    def read_field():
        """Pole tekstowe: int32 rozmiar bloku, bajt długości, potem treść."""
        nonlocal pos
        if pos + 5 > len(data):
            raise ValueError('plik urwany')
        (size,) = struct.unpack_from('<i', data, pos)
        pos += 4
        if size < 1 or pos + size > len(data):
            raise ValueError(f'niepoprawny rozmiar pola: {size}')
        length = data[pos]
        pos += 1
        raw = data[pos:pos + size - 1]
        pos += size - 1
        return raw[:length].decode(_GP345_ENCODING, 'replace')

    # Kolejność jest ta sama w GP3, GP4 i GP5 aż do albumu — dalej formaty
    # się rozjeżdżają (GP5 wstawia osobne Words/Music), ale nas to nie sięga.
    title = read_field()
    read_field()  # subtitle — pomijamy
    artist = read_field()
    album = read_field()

    return {
        'title': _clean(title),
        'artist': _clean(artist),
        'album': _clean(album),
    }


# ── Wejście publiczne ───────────────────────────────────────────────────────

_EXTRACTORS = {
    '.gp': _extract_gp,
    '.gp3': _extract_gp345,
    '.gp4': _extract_gp345,
    '.gp5': _extract_gp345,
}


def extract_song_metadata(fileobj, filename):
    """Zwraca dict z niepustymi polami z ``METADATA_FIELDS``.

    Puste stringi są odsiewane — plik bez wpisanego albumu nie ma nadpisywać
    albumu wpisanego ręcznie. Nigdy nie rzuca; przy dowolnym problemie
    zwraca ``{}``.
    """
    ext = os.path.splitext(filename or '')[1].lower()
    extractor = _EXTRACTORS.get(ext)
    if extractor is None:
        # .gpx i cokolwiek innego — brak parsera, zostawiamy dane w spokoju
        return {}

    try:
        fileobj.seek(0)
        raw = extractor(fileobj)
    except Exception:
        logger.warning('Nie udało się odczytać metadanych z %s', filename, exc_info=True)
        return {}
    finally:
        try:
            fileobj.seek(0)
        except Exception:
            pass

    return {k: v for k, v in raw.items() if k in METADATA_FIELDS and v}
