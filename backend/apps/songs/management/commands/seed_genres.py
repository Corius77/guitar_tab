from django.core.management.base import BaseCommand
from apps.songs.models import Genre

GENRES = [
    'Rock', 'Metal', 'Blues', 'Jazz', 'Pop', 'Country',
    'Classical', 'Funk', 'Reggae', 'Alternative', 'Folk',
]


class Command(BaseCommand):
    help = 'Seed the database with default genres'

    def handle(self, *args, **options):
        created = 0
        for name in GENRES:
            _, is_new = Genre.objects.get_or_create(name=name)
            if is_new:
                created += 1
        self.stdout.write(self.style.SUCCESS(f'Created {created} genres.'))
