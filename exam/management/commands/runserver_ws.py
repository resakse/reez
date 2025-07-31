from daphne.management.commands.runserver import Command as DaphneCommand

class Command(DaphneCommand):
    help = 'Run development server with WebSocket support using Daphne'
    
    def add_arguments(self, parser):
        super().add_arguments(parser)
        parser.add_argument(
            '--noreload', action='store_false', dest='use_reloader', 
            default=True, help='Tells Django to NOT use the auto-reloader.'
        )
    
    def handle(self, *args, **options):
        # Enable auto-reload by default for development
        if options.get('use_reloader', True):
            options['use_reloader'] = True
        
        return super().handle(*args, **options)