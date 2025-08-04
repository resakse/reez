#!/bin/bash

# RIS Production Deployment Script
# This script handles the complete deployment process for the AI-Powered RIS

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_ENV="${1:-production}"
PROJECT_DIR="/opt/ris-${DEPLOYMENT_ENV}"
BACKUP_DIR="/var/backups/ris"
LOG_FILE="/var/log/ris-deployment.log"
HEALTH_CHECK_URL="http://localhost/health/"
MAX_HEALTH_RETRIES=30
HEALTH_CHECK_INTERVAL=10

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$LOG_FILE"
    exit 1
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}" | tee -a "$LOG_FILE"
}

# Validate environment
validate_environment() {
    log "Validating deployment environment: $DEPLOYMENT_ENV"
    
    if [[ ! "$DEPLOYMENT_ENV" =~ ^(staging|production)$ ]]; then
        error "Invalid environment. Use 'staging' or 'production'"
    fi
    
    if [ ! -d "$PROJECT_DIR" ]; then
        error "Project directory not found: $PROJECT_DIR"
    fi
    
    if [ ! -f "$PROJECT_DIR/docker-compose.${DEPLOYMENT_ENV}.yml" ]; then
        error "Docker compose file not found: docker-compose.${DEPLOYMENT_ENV}.yml"
    fi
    
    # Check if running as root or with sudo
    if [ $EUID -ne 0 ]; then
        error "This script must be run as root or with sudo"
    fi
    
    log "Environment validation passed"
}

# Pre-deployment backup
create_backup() {
    log "Creating pre-deployment backup..."
    
    if [ -x "$PROJECT_DIR/deployment/backup/backup_strategy.sh" ]; then
        "$PROJECT_DIR/deployment/backup/backup_strategy.sh"
        log "Pre-deployment backup completed"
    else
        warn "Backup script not found, skipping backup"
    fi
}

# Check system resources
check_system_resources() {
    log "Checking system resources..."
    
    # Check disk space (minimum 10GB free)
    available_space=$(df / | awk 'NR==2 {print $4}')
    required_space=10485760  # 10GB in KB
    
    if [ "$available_space" -lt "$required_space" ]; then
        error "Insufficient disk space. Available: $(($available_space/1024/1024))GB, Required: 10GB"
    fi
    
    # Check memory (minimum 4GB)
    available_memory=$(free -m | awk 'NR==2{print $7}')
    required_memory=4096  # 4GB in MB
    
    if [ "$available_memory" -lt "$required_memory" ]; then
        warn "Low available memory. Available: ${available_memory}MB, Recommended: 4GB"
    fi
    
    log "System resources check passed"
}

# Pull latest code
update_code() {
    log "Updating code from repository..."
    
    cd "$PROJECT_DIR"
    
    # Determine branch based on environment
    if [ "$DEPLOYMENT_ENV" = "production" ]; then
        BRANCH="production"
    else
        BRANCH="main"
    fi
    
    # Stash any local changes
    git stash push -m "Pre-deployment stash $(date)"
    
    # Pull latest changes
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
    
    log "Code update completed"
}

# Build and pull Docker images
update_images() {
    log "Updating Docker images..."
    
    cd "$PROJECT_DIR"
    
    # Pull latest images
    docker-compose -f "docker-compose.${DEPLOYMENT_ENV}.yml" pull
    
    # Build application image if needed
    if [ -f "Dockerfile" ]; then
        docker-compose -f "docker-compose.${DEPLOYMENT_ENV}.yml" build --no-cache app
    fi
    
    log "Docker images updated"
}

# Database migration
run_migrations() {
    log "Running database migrations..."
    
    cd "$PROJECT_DIR"
    
    # Run migrations in a temporary container
    docker-compose -f "docker-compose.${DEPLOYMENT_ENV}.yml" run --rm app python manage.py migrate --noinput
    
    log "Database migrations completed"
}

# Collect static files
collect_static() {
    log "Collecting static files..."
    
    cd "$PROJECT_DIR"
    
    # Collect static files
    docker-compose -f "docker-compose.${DEPLOYMENT_ENV}.yml" run --rm app python manage.py collectstatic --noinput --clear
    
    log "Static files collected"
}

# Health check function
health_check() {
    local retries=0
    
    log "Performing health checks..."
    
    while [ $retries -lt $MAX_HEALTH_RETRIES ]; do
        if curl -f -s "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
            log "Health check passed"
            return 0
        fi
        
        retries=$((retries + 1))
        warn "Health check failed, retrying... ($retries/$MAX_HEALTH_RETRIES)"
        sleep $HEALTH_CHECK_INTERVAL
    done
    
    error "Health check failed after $MAX_HEALTH_RETRIES attempts"
}

# Deploy with zero downtime
deploy_services() {
    log "Deploying services with zero-downtime strategy..."
    
    cd "$PROJECT_DIR"
    
    # Start database and supporting services first
    log "Starting database and supporting services..."
    docker-compose -f "docker-compose.${DEPLOYMENT_ENV}.yml" up -d database redis ollama
    
    # Wait for services to be ready
    sleep 30
    
    # Start application with scaling for zero downtime
    log "Starting application services..."
    
    # Scale up new instances
    docker-compose -f "docker-compose.${DEPLOYMENT_ENV}.yml" up -d --scale app=2 app
    
    # Wait for new instances to be ready
    sleep 60
    
    # Start nginx to handle traffic
    docker-compose -f "docker-compose.${DEPLOYMENT_ENV}.yml" up -d nginx
    
    # Wait for nginx to be ready
    sleep 30
    
    # Scale down to normal capacity and cleanup old containers
    docker-compose -f "docker-compose.${DEPLOYMENT_ENV}.yml" up -d --remove-orphans
    
    log "Services deployment completed"
}

# Post-deployment tasks
post_deployment() {
    log "Running post-deployment tasks..."
    
    # Health checks
    health_check
    
    # Test API endpoints
    log "Testing API endpoints..."
    if curl -f -s "${HEALTH_CHECK_URL%/health/}/api/health/" >/dev/null 2>&1; then
        log "API health check passed"
    else
        warn "API health check failed"
    fi
    
    # Test AI system if enabled
    log "Testing AI system..."
    if curl -f -s "http://localhost:11434/api/tags" >/dev/null 2>&1; then
        log "AI system check passed"
    else
        warn "AI system check failed"
    fi
    
    # Cleanup old Docker images
    log "Cleaning up old Docker images..."
    docker system prune -f
    
    log "Post-deployment tasks completed"
}

# Rollback function
rollback() {
    error_msg="$1"
    
    error "Deployment failed: $error_msg"
    log "Initiating rollback procedure..."
    
    cd "$PROJECT_DIR"
    
    # Stop current services
    docker-compose -f "docker-compose.${DEPLOYMENT_ENV}.yml" down
    
    # Restore from backup if available
    if [ -x "$PROJECT_DIR/deployment/backup/restore_latest_backup.sh" ]; then
        "$PROJECT_DIR/deployment/backup/restore_latest_backup.sh"
    fi
    
    # Rollback to previous Git commit
    git checkout HEAD~1
    
    # Start services with previous version
    docker-compose -f "docker-compose.${DEPLOYMENT_ENV}.yml" up -d
    
    # Wait and check health
    sleep 60
    if curl -f -s "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
        log "Rollback completed successfully"
    else
        error "Rollback failed - manual intervention required"
    fi
    
    exit 1
}

# Send deployment notification
send_notification() {
    local status="$1"
    local message="$2"
    
    # Send email notification if configured
    if command -v mail >/dev/null 2>&1 && [ -n "${NOTIFICATION_EMAIL:-}" ]; then
        echo "$message" | mail -s "RIS Deployment $status - $DEPLOYMENT_ENV" "$NOTIFICATION_EMAIL"
    fi
    
    # Send Slack notification if configured
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"RIS Deployment $status ($DEPLOYMENT_ENV): $message\"}" \
            "$SLACK_WEBHOOK_URL" || true
    fi
    
    log "Notification sent: $status"
}

# Deployment summary
deployment_summary() {
    local end_time=$(date)
    local duration=$(($(date +%s) - deployment_start_time))
    
    log "========================================="
    log "DEPLOYMENT SUMMARY"
    log "========================================="
    log "Environment: $DEPLOYMENT_ENV"
    log "Start Time: $deployment_start_time_str"
    log "End Time: $end_time"
    log "Duration: ${duration}s"
    log "Status: SUCCESS"
    log "Health Check URL: $HEALTH_CHECK_URL"
    log "========================================="
}

# Main deployment function
main() {
    local deployment_start_time=$(date +%s)
    local deployment_start_time_str=$(date)
    
    log "========================================="
    log "RIS DEPLOYMENT STARTED"
    log "Environment: $DEPLOYMENT_ENV"
    log "Time: $deployment_start_time_str"
    log "========================================="
    
    # Set trap for rollback on error
    trap 'rollback "Deployment script failed"' ERR
    
    # Deployment steps
    validate_environment
    check_system_resources
    create_backup
    update_code
    update_images
    run_migrations
    collect_static
    deploy_services
    post_deployment
    
    # Success notification
    deployment_summary
    send_notification "SUCCESS" "Deployment completed successfully in ${duration}s"
    
    log "RIS deployment completed successfully!"
}

# Script usage
usage() {
    echo "Usage: $0 [staging|production]"
    echo ""
    echo "Options:"
    echo "  staging     Deploy to staging environment"
    echo "  production  Deploy to production environment"
    echo ""
    echo "Environment variables:"
    echo "  NOTIFICATION_EMAIL  Email address for deployment notifications"
    echo "  SLACK_WEBHOOK_URL   Slack webhook URL for notifications"
    echo ""
    echo "Examples:"
    echo "  $0 staging"
    echo "  NOTIFICATION_EMAIL=admin@example.com $0 production"
}

# Check arguments
if [ $# -eq 0 ]; then
    usage
    exit 1
fi

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
    exit 0
fi

# Run main deployment
main "$@"