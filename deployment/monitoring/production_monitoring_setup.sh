#!/bin/bash

# Production Monitoring Enhancement Script for AI-Powered RIS
# This script enhances the existing audit and logging system for production

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
MONITORING_DIR="/opt/ris-monitoring"
LOG_DIR="/var/log/ris"
BACKUP_DIR="/var/backups/ris"
ALERT_EMAIL="admin@yourdomain.com"

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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root"
fi

log "Setting up production monitoring enhancements for AI-Powered RIS..."

# 1. Create monitoring directories
log "Creating monitoring directories..."
mkdir -p "$MONITORING_DIR"/{scripts,config,reports}
mkdir -p "$LOG_DIR"
mkdir -p "$BACKUP_DIR"/{monitoring,reports}

# 2. Create system health monitoring script
log "Creating system health monitoring script..."
cat > "$MONITORING_DIR/scripts/system_health.sh" << 'EOF'
#!/bin/bash

# System Health Monitoring Script for RIS
# This script checks system health and integrates with existing audit system

ALERT_EMAIL="${ALERT_EMAIL:-admin@localhost}"
LOG_FILE="/var/log/ris/system_health.log"
RIS_DIR="/home/resakse/Coding/reez"

# Function to log with timestamp
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Function to send alert
send_alert() {
    local subject="$1"
    local message="$2"
    
    if command -v mail >/dev/null 2>&1; then
        echo "$message" | mail -s "$subject" "$ALERT_EMAIL"
    else
        log_message "ALERT: $subject - $message"
    fi
}

# Check disk usage
check_disk_usage() {
    local usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$usage" -gt 90 ]; then
        send_alert "RIS Critical: Disk Usage ${usage}%" "Root disk usage is critically high at ${usage}%"
        log_message "CRITICAL: Disk usage at ${usage}%"
    elif [ "$usage" -gt 80 ]; then
        log_message "WARNING: Disk usage at ${usage}%"
    else
        log_message "INFO: Disk usage at ${usage}%"
    fi
}

# Check memory usage
check_memory_usage() {
    local mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    
    if [ "$mem_usage" -gt 90 ]; then
        send_alert "RIS Critical: Memory Usage ${mem_usage}%" "Memory usage is critically high at ${mem_usage}%"
        log_message "CRITICAL: Memory usage at ${mem_usage}%"
    elif [ "$mem_usage" -gt 80 ]; then
        log_message "WARNING: Memory usage at ${mem_usage}%"
    else
        log_message "INFO: Memory usage at ${mem_usage}%"
    fi
}

# Check CPU load
check_cpu_load() {
    local load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    local cores=$(nproc)
    local load_percent=$(echo "$load * 100 / $cores" | bc -l | cut -d. -f1)
    
    if [ "$load_percent" -gt 90 ]; then
        send_alert "RIS Critical: CPU Load ${load_percent}%" "CPU load is critically high at ${load_percent}%"
        log_message "CRITICAL: CPU load at ${load_percent}%"
    elif [ "$load_percent" -gt 80 ]; then
        log_message "WARNING: CPU load at ${load_percent}%"
    else
        log_message "INFO: CPU load at ${load_percent}%"
    fi
}

# Check RIS services
check_ris_services() {
    local services=("postgresql" "redis-server" "nginx")
    
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            log_message "INFO: $service is running"
        else
            send_alert "RIS Critical: Service Down" "$service is not running"
            log_message "CRITICAL: $service is not running"
        fi
    done
}

# Check database connectivity
check_database() {
    cd "$RIS_DIR"
    
    if timeout 30 python manage.py shell -c "
from django.db import connection
try:
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')
    print('OK')
except Exception as e:
    print(f'ERROR: {e}')
    exit(1)
" 2>/dev/null | grep -q "OK"; then
        log_message "INFO: Database connection OK"
    else
        send_alert "RIS Critical: Database Error" "Cannot connect to database"
        log_message "CRITICAL: Database connection failed"
    fi
}

# Check AI system (Ollama)
check_ai_system() {
    local ollama_url="http://localhost:11434"
    
    if curl -s --max-time 10 "$ollama_url/api/tags" >/dev/null 2>&1; then
        log_message "INFO: AI system (Ollama) is responding"
    else
        send_alert "RIS Warning: AI System" "AI system (Ollama) is not responding"
        log_message "WARNING: AI system (Ollama) not responding"
    fi
}

# Check log file sizes
check_log_sizes() {
    find /var/log/ris -name "*.log" -size +100M | while read -r logfile; do
        local size=$(du -h "$logfile" | cut -f1)
        log_message "WARNING: Large log file $logfile ($size)"
    done
}

# Main execution
log_message "Starting system health check"

check_disk_usage
check_memory_usage  
check_cpu_load
check_ris_services
check_database
check_ai_system
check_log_sizes

log_message "System health check completed"
EOF

chmod +x "$MONITORING_DIR/scripts/system_health.sh"

# 3. Create application performance monitoring script
cat > "$MONITORING_DIR/scripts/app_performance.sh" << 'EOF'
#!/bin/bash

# Application Performance Monitoring for RIS
# Integrates with existing audit system

LOG_FILE="/var/log/ris/app_performance.log"
RIS_DIR="/home/resakse/Coding/reez"
REPORT_FILE="/var/backups/ris/reports/performance_$(date +%Y%m%d).json"

# Function to log with timestamp
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Check database performance
check_database_performance() {
    cd "$RIS_DIR"
    
    local db_stats=$(python manage.py shell -c "
from django.db import connection
from audit.models import AuditLog
from exam.models import Daftar, Pemeriksaan
from pesakit.models import Pesakit

# Get table counts
audit_count = AuditLog.objects.count()
patient_count = Pesakit.objects.count() 
exam_count = Daftar.objects.count()
pemeriksaan_count = Pemeriksaan.objects.count()

# Get recent activity (last 24 hours)
from django.utils import timezone
from datetime import timedelta
yesterday = timezone.now() - timedelta(days=1)
recent_audits = AuditLog.objects.filter(timestamp__gte=yesterday).count()
recent_exams = Daftar.objects.filter(created__gte=yesterday).count() if hasattr(Daftar, 'created') else 0

# Database size (approximate)
with connection.cursor() as cursor:
    cursor.execute(\"SELECT pg_size_pretty(pg_database_size(current_database()))\")
    db_size = cursor.fetchone()[0] if connection.vendor == 'postgresql' else 'N/A'

print(f'{{\"audit_logs\": {audit_count}, \"patients\": {patient_count}, \"examinations\": {exam_count}, \"pemeriksaan\": {pemeriksaan_count}, \"recent_audits_24h\": {recent_audits}, \"recent_exams_24h\": {recent_exams}, \"db_size\": \"{db_size}\"}}')
")
    
    echo "$db_stats" > "$REPORT_FILE"
    log_message "Database stats: $db_stats"
}

# Check Redis performance
check_redis_performance() {
    if command -v redis-cli >/dev/null 2>&1; then
        local redis_info=$(redis-cli info memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r\n' || echo "N/A")
        local redis_connections=$(redis-cli info clients 2>/dev/null | grep connected_clients | cut -d: -f2 | tr -d '\r\n' || echo "N/A")
        
        log_message "Redis memory usage: $redis_info, connections: $redis_connections"
    fi
}

# Check AI system performance
check_ai_performance() {
    cd "$RIS_DIR"
    
    # Count AI reports generated in the last 24 hours
    local ai_stats=$(python manage.py shell -c "
from exam.models import AIGeneratedReport
from django.utils import timezone
from datetime import timedelta

yesterday = timezone.now() - timedelta(days=1)
recent_ai_reports = AIGeneratedReport.objects.filter(created_at__gte=yesterday).count()
total_ai_reports = AIGeneratedReport.objects.count()

print(f'{{\"recent_ai_reports_24h\": {recent_ai_reports}, \"total_ai_reports\": {total_ai_reports}}}')
" 2>/dev/null || echo '{"recent_ai_reports_24h": 0, "total_ai_reports": 0}')
    
    log_message "AI system stats: $ai_stats"
}

# Main execution
log_message "Starting application performance check"

check_database_performance
check_redis_performance
check_ai_performance

log_message "Application performance check completed"
EOF

chmod +x "$MONITORING_DIR/scripts/app_performance.sh"

# 4. Create comprehensive monitoring dashboard script
cat > "$MONITORING_DIR/scripts/monitoring_dashboard.sh" << 'EOF'
#!/bin/bash

# RIS Monitoring Dashboard - Production Status Overview

echo "======================================"
echo "RIS Production Monitoring Dashboard"
echo "======================================"
echo "Generated: $(date)"
echo

# System Information
echo "SYSTEM INFORMATION"
echo "=================="
echo "Hostname: $(hostname)"
echo "Uptime: $(uptime -p)"
echo "Load Average: $(uptime | awk -F'load average:' '{print $2}')"
echo "Memory Usage: $(free -h | awk 'NR==2{printf "%s/%s (%s used)", $3, $2, ($3/$2)*100"%"}')"
echo "Disk Usage: $(df -h / | awk 'NR==2{printf "%s/%s (%s used)", $3, $2, $5}')"
echo

# Service Status
echo "SERVICE STATUS"
echo "=============="
services=("postgresql" "redis-server" "nginx" "ollama")
for service in "${services[@]}"; do
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        echo "✅ $service: Running"
    else
        echo "❌ $service: Stopped"
    fi
done
echo

# Database Status
echo "DATABASE STATUS"
echo "==============="
RIS_DIR="/home/resakse/Coding/reez"
if [ -d "$RIS_DIR" ]; then
    cd "$RIS_DIR"
    python manage.py shell -c "
from django.db import connection
from audit.models import AuditLog
from pesakit.models import Pesakit
from exam.models import Daftar
from django.utils import timezone
from datetime import timedelta

# Test connection
try:
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')
    print('✅ Database Connection: OK')
except:
    print('❌ Database Connection: Failed')

# Get counts
try:
    print(f'📊 Total Patients: {Pesakit.objects.count():,}')
    print(f'📊 Total Examinations: {Daftar.objects.count():,}')
    print(f'📊 Total Audit Logs: {AuditLog.objects.count():,}')
    
    # Recent activity
    yesterday = timezone.now() - timedelta(days=1)
    recent_audits = AuditLog.objects.filter(timestamp__gte=yesterday).count()
    print(f'📈 Audit Logs (24h): {recent_audits:,}')
except Exception as e:
    print(f'⚠️ Error getting database stats: {e}')
" 2>/dev/null
else
    echo "❌ RIS directory not found"
fi
echo

# AI System Status
echo "AI SYSTEM STATUS"
echo "================"
if curl -s --max-time 5 "http://localhost:11434/api/tags" >/dev/null 2>&1; then
    echo "✅ Ollama Server: Running"
    model_count=$(curl -s "http://localhost:11434/api/tags" | python3 -c "import json,sys; data=json.load(sys.stdin); print(len(data.get('models', [])))" 2>/dev/null || echo "0")
    echo "📊 AI Models Available: $model_count"
else
    echo "❌ Ollama Server: Not responding"
fi
echo

# Recent Logs
echo "RECENT SYSTEM ACTIVITY"
echo "======================"
if [ -f "/var/log/ris/system_health.log" ]; then
    echo "Last 5 system health entries:"
    tail -5 /var/log/ris/system_health.log 2>/dev/null || echo "No recent entries"
else
    echo "System health log not found"
fi
echo

# Disk Space Details
echo "DISK SPACE DETAILS"
echo "=================="
df -h | grep -E "(Filesystem|/dev/)"
echo

echo "======================================"
echo "Dashboard generated at $(date)"
echo "======================================"
EOF

chmod +x "$MONITORING_DIR/scripts/monitoring_dashboard.sh"

# 5. Create alert configuration
cat > "$MONITORING_DIR/config/alerts.conf" << EOF
# RIS Monitoring Alert Configuration

# Email settings
ALERT_EMAIL="$ALERT_EMAIL"
SMTP_SERVER="localhost"
SMTP_PORT="25"

# Thresholds
DISK_WARNING_THRESHOLD=80
DISK_CRITICAL_THRESHOLD=90
MEMORY_WARNING_THRESHOLD=80
MEMORY_CRITICAL_THRESHOLD=90
CPU_WARNING_THRESHOLD=80
CPU_CRITICAL_THRESHOLD=90

# Service monitoring
CRITICAL_SERVICES="postgresql redis-server nginx"
OPTIONAL_SERVICES="ollama"

# Check intervals (minutes)
SYSTEM_HEALTH_INTERVAL=15
APP_PERFORMANCE_INTERVAL=60
AI_SYSTEM_INTERVAL=30
EOF

# 6. Set up cron jobs for monitoring
log "Setting up monitoring cron jobs..."
cat > /tmp/ris_monitoring_cron << EOF
# RIS Production Monitoring Cron Jobs

# System health check every 15 minutes
*/15 * * * * $MONITORING_DIR/scripts/system_health.sh

# Application performance check every hour
0 * * * * $MONITORING_DIR/scripts/app_performance.sh

# Daily monitoring dashboard report (sent via email if configured)
0 8 * * * $MONITORING_DIR/scripts/monitoring_dashboard.sh | mail -s "RIS Daily Status Report" $ALERT_EMAIL

# Weekly comprehensive report
0 9 * * 1 $MONITORING_DIR/scripts/monitoring_dashboard.sh > /var/backups/ris/reports/weekly_report_\$(date +\\%Y\\%m\\%d).txt

# Monthly cleanup of monitoring logs (keep 3 months)
0 2 1 * * find /var/log/ris -name "*.log" -mtime +90 -delete
EOF

# Install cron jobs
crontab -l 2>/dev/null > /tmp/current_cron || touch /tmp/current_cron
cat /tmp/current_cron /tmp/ris_monitoring_cron | crontab -
rm /tmp/ris_monitoring_cron /tmp/current_cron

# 7. Create log rotation for monitoring logs
cat > /etc/logrotate.d/ris-monitoring << EOF
/var/log/ris/system_health.log
/var/log/ris/app_performance.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
}
EOF

# 8. Install monitoring dependencies
log "Installing monitoring dependencies..."
apt update
apt install -y mailutils bc curl jq

# 9. Set proper permissions
chown -R root:root "$MONITORING_DIR"
chmod -R 755 "$MONITORING_DIR"
chmod +x "$MONITORING_DIR"/scripts/*.sh

# 10. Create startup script for monitoring
cat > /etc/systemd/system/ris-monitoring.service << EOF
[Unit]
Description=RIS Production Monitoring Service
After=network.target postgresql.service redis.service

[Service]
Type=oneshot
ExecStart=$MONITORING_DIR/scripts/system_health.sh
RemainAfterExit=no

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ris-monitoring.service

# 11. Test monitoring setup
log "Testing monitoring setup..."
if [ -x "$MONITORING_DIR/scripts/system_health.sh" ]; then
    log "Running initial system health check..."
    "$MONITORING_DIR/scripts/system_health.sh"
    log "System health check completed"
fi

if [ -x "$MONITORING_DIR/scripts/monitoring_dashboard.sh" ]; then
    log "Generating initial monitoring dashboard..."
    "$MONITORING_DIR/scripts/monitoring_dashboard.sh" > /tmp/initial_dashboard.txt
    log "Initial dashboard saved to /tmp/initial_dashboard.txt"
fi

log "Production monitoring setup completed successfully!"

warn "Important next steps:"
warn "1. Configure email settings in $MONITORING_DIR/config/alerts.conf"
warn "2. Test email alerts: echo 'Test alert' | mail -s 'RIS Test Alert' $ALERT_EMAIL"
warn "3. Review monitoring thresholds in the configuration"
warn "4. Check cron job installation: crontab -l"
warn "5. Monitor log files in /var/log/ris/"
warn "6. Set up external monitoring if needed (Nagios, Zabbix, etc.)"

log "Monitoring commands:"
log "- System health: $MONITORING_DIR/scripts/system_health.sh"
log "- Performance check: $MONITORING_DIR/scripts/app_performance.sh"
log "- Dashboard: $MONITORING_DIR/scripts/monitoring_dashboard.sh"
log "- View health log: tail -f /var/log/ris/system_health.log"
log "- View performance log: tail -f /var/log/ris/app_performance.log"