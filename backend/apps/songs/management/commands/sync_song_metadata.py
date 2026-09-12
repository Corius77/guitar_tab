"""Przepisuje tytuł / wykonawcę / album z plików Guitar Pro do bazy.

Utwory wgrane zanim upload zaczął czytać metadane mają w bazie to, co
wpisano ręcznie (często byle co). Ta komenda zrównuje je z plikami.

    python manage.py sync_song_metadata --dry-run   # tylko pokaż
    python manage.py sync_song_metadata             # zapisz
    python manage.py sync_song_metadata --only-blank

Domyślnie NADPISUJE istniejące wartości — bo o to chodzi. ``--only-blank``
uzupełnia wyłącznie puste pola.
"""

from django.core.management.base import BaseCommand

from apps.songs.metadata import METADATA_FIELDS, extract_song_metadata
from apps.songs.models import Song


class Command(BaseCommand):
    help = 'Zgrywa metadane utworów (tytuł/wykonawca/album) z ich plików Guitar Pro.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Pokaż, co by się zmieniło, ale nic nie zapisuj.',
        )
        parser.add_argument(
            '--only-blank', action='store_true',
            help='Uzupełnij tylko puste pola zamiast nadpisywać.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        only_blank = options['only_blank']

        changed = skipped = unreadable = 0

        for song in Song.objects.order_by('id'):
            if not song.tab_file:
                unreadable += 1
                self.stdout.write(self.style.WARNING(f'#{song.id} — brak pliku'))
                continue

            try:
                with song.tab_file.open('rb') as fh:
                    meta = extract_song_metadata(fh, song.tab_file.name)
            except FileNotFoundError:
                unreadable += 1
                self.stdout.write(self.style.WARNING(
                    f'#{song.id} — pliku nie ma na dysku: {song.tab_file.name}'
                ))
                continue

            if not meta:
                unreadable += 1
                self.stdout.write(self.style.WARNING(
                    f'#{song.id} — nie odczytano metadanych z {song.tab_file.name}'
                ))
                continue

            updates = {}
            for field in METADATA_FIELDS:
                new = meta.get(field)
                if not new:
                    continue
                old = getattr(song, field) or ''
                if only_blank and old.strip():
                    continue
                if old != new:
                    updates[field] = new

            if not updates:
                skipped += 1
                continue

            changed += 1
            opis = ', '.join(
                f'{f}: "{getattr(song, f)}" -> "{v}"' for f, v in updates.items()
            )
            self.stdout.write(f'#{song.id} {opis}')

            if not dry_run:
                for field, value in updates.items():
                    setattr(song, field, value)
                song.save(update_fields=list(updates) + ['updated_at'])

        podsumowanie = (
            f'Zmienione: {changed}, bez zmian: {skipped}, nieodczytane: {unreadable}'
        )
        if dry_run:
            self.stdout.write(self.style.WARNING(f'[dry-run] {podsumowanie} — nic nie zapisano'))
        else:
            self.stdout.write(self.style.SUCCESS(podsumowanie))
