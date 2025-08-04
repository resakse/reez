#!/bin/bash

# Docker Entrypoint Script for RIS Application
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Wait for database to be ready
wait_for_db() {
    log "Waiting for database to be ready..."
    
    local retries=30
    local count=0
    
    while [ $count -lt $retries ]; do
        if python manage.py shell -c "
from django.db import connection
try:
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')
    print('Database ready')
    exit(0)
except Exception as e:
    print(f'Database not ready: {e}')
    exit(1)
" 2>/dev/null; then
            log "Database is ready!"
            return 0
        fi
        
        count=$((count + 1))
        warn "Database not ready, retrying in 10 seconds... ($count/$retries)"
        sleep 10
    done
    
    error "Database failed to become ready after $retries attempts"
}

# Wait for Redis to be ready
wait_for_redis() {
    log "Waiting for Redis to be ready..."
    
    local retries=10
    local count=0
    
    while [ $count -lt $retries ]; do
        if redis-cli -h redis -p 6379 -a "${REDIS_PASSWORD:-}" ping >/dev/null 2>&1; then
            log "Redis is ready!"
            return 0
        fi
        
        count=$((count + 1))
        warn "Redis not ready, retrying in 5 seconds... ($count/$retries)"
        sleep 5
    done
    
    error "Redis failed to become ready after $retries attempts"
}

# Wait for Ollama to be ready (optional)
wait_for_ollama() {
    if [ "${AI_REPORTING_ENABLED:-True}" = "True" ]; then
        log "Waiting for Ollama AI server to be ready..."
        
        local retries=20
        local count=0
        
        while [ $count -lt $retries ]; do
            if curl -s --max-time 10 "${AI_OLLAMA_SERVER_URL:-http://ollama:11434}/api/tags" >/dev/null 2>&1; then
                log "Ollama AI server is ready!"
                return 0
            fi
            
            count=$((count + 1))
            warn "Ollama not ready, retrying in 15 seconds... ($count/$retries)"
            sleep 15
        done
        
        warn "Ollama AI server not ready after $retries attempts, continuing anyway..."
    else
        log "AI reporting disabled, skipping Ollama check"
    fi
}

# Initialize database
init_database() {
    log "Initializing database..."
    
    # Apply migrations
    log "Running database migrations..."
    python manage.py migrate --noinput
    
    # Collect static files
    log "Collecting static files..."
    python manage.py collectstatic --noinput --clear
    
    # Create superuser if it doesn't exist
    if [ -n "${DJANGO_SUPERUSER_USERNAME:-}" ] && [ -n "${DJANGO_SUPERUSER_PASSWORD:-}" ]; then
        log "Creating superuser..."
        python manage.py shell -c "
from staff.models import Staff
if not Staff.objects.filter(username='${DJANGO_SUPERUSER_USERNAME}').exists():
    Staff.objects.create_superuser(
        username='${DJANGO_SUPERUSER_USERNAME}',
        email='${DJANGO_SUPERUSER_EMAIL:-admin@localhost}',
        password='${DJANGO_SUPERUSER_PASSWORD}'
    )
    print('Superuser created successfully')
else:
    print('Superuser already exists')
"
    fi
    
    # Load initial data if needed
    if [ "${LOAD_INITIAL_DATA:-False}" = "True" ]; then
        log "Loading initial data..."
        if [ -f "fixtures/initial_data.json" ]; then
            python manage.py loaddata fixtures/initial_data.json
        fi
    fi
}

# Start AI model initialization (background)
init_ai_models() {
    if [ "${AI_REPORTING_ENABLED:-True}" = "True" ]; then
        log "Initializing AI models in background..."
        
        # Create background task to initialize AI models
        {
            sleep 60  # Wait for system to stabilize
            
            # Check if models are already available
            if curl -s "${AI_OLLAMA_SERVER_URL:-http://ollama:11434}/api/tags" | grep -q "models"; then
                log "AI models already available"
            else
                log "Downloading AI models..."
                
                # Download required models
                for model in "${AI_VISION_MODEL:-llava-med:7b}" "${AI_MEDICAL_LLM:-meditron:7b}" "${AI_QA_MODEL:-medalpaca:7b}"; do
                    log "Downloading model: $model"
                    curl -X POST "${AI_OLLAMA_SERVER_URL:-http://ollama:11434}/api/pull" \
                        -H "Content-Type: application/json" \
                        -d "{\"name\": \"$model\"}" || warn "Failed to download model: $model"
                done
                
                log "AI models initialization completed"
            fi
        } &
    fi
}

# Health check function
health_check() {
    log "Running health checks..."
    
    # Check database
    if ! python manage.py shell -c "
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute('SELECT 1')
"; then
        error "Database health check failed"
    fi
    
    # Check Redis
    if ! redis-cli -h redis -p 6379 -a "${REDIS_PASSWORD:-}" ping >/dev/null 2>&1; then
        error "Redis health check failed"
    fi
    
    log "Health checks passed"
}

# Setup log directories
setup_logging() {
    log "Setting up logging..."
    
    mkdir -p /app/logs
    
    # Ensure log files exist with proper permissions
    touch /app/logs/django.log
    touch /app/logs/gunicorn.log
    touch /app/logs/celery.log
    
    # Set proper permissions
    chown -R ris:ris /app/logs
    chmod 755 /app/logs
    chmod 644 /app/logs/*.log
}

# Start services based on command
start_services() {
    case "${1:-all}" in
        "django")
            log "Starting Django application server..."
            exec gunicorn reez.wsgi:application \
                --bind 0.0.0.0:8000 \
                --workers ${GUNICORN_WORKERS:-4} \
                --threads ${GUNICORN_THREADS:-2} \
                --timeout ${GUNICORN_TIMEOUT:-300} \
                --max-requests ${GUNICORN_MAX_REQUESTS:-1000} \
                --max-requests-jitter ${GUNICORN_MAX_REQUESTS_JITTER:-100} \
                --preload \
                --access-logfile /app/logs/gunicorn.log \
                --error-logfile /app/logs/gunicorn.log \
                --log-level info
            ;;
        
        "frontend")
            log "Starting Next.js frontend server..."
            cd ris-frontend
            exec npm start
            ;;
        
        "celery")
            log "Starting Celery worker..."
            exec celery -A reez worker \
                --loglevel=info \
                --logfile=/app/logs/celery.log \
                --concurrency=${CELERY_WORKERS:-2}
            ;;
        
        "celery-beat")
            log "Starting Celery beat scheduler..."
            exec celery -A reez beat \
                --loglevel=info \
                --logfile=/app/logs/celery-beat.log \
                --pidfile=/app/logs/celerybeat.pid
            ;;
        
        "migration")
            log "Running database migration only..."
            python manage.py migrate --noinput
            log "Migration completed"
            exit 0
            ;;
        
        "shell")
            log "Starting Django shell..."
            exec python manage.py shell
            ;;
        
        "all"|*)
            log "Starting all services via supervisord..."
            exec "$@"
            ;;
    esac
}

# Main entrypoint logic
main() {
    log "Starting RIS Application Container..."
    log "Command: $*"
    
    # Setup basic environment
    setup_logging
    
    # Wait for dependencies (only if starting full application)
    if [ "${1:-all}" = "all" ] || [ "${1:-all}" = "supervisord" ]; then
        wait_for_db
        wait_for_redis
        wait_for_ollama
        
        # Initialize database
        init_database
        
        # Initialize AI models in background
        init_ai_models
        
        # Run health checks
        health_check
    fi
    
    # Start the requested service(s)
    start_services "$@"
}

# Handle signals for graceful shutdown
trap 'log "Received shutdown signal, stopping services..."; exit 0' TERM INT

# Run main function
main "$@"