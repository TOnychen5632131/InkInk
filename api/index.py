from backend.app import create_app

# Vercel Python runtime will look for a WSGI app named "app"
app = create_app()
