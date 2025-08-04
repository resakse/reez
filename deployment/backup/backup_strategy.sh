#!/bin/bash

# Comprehensive Backup Strategy for AI-Powered RIS Production
# This script sets up automated backup and recovery procedures

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKUP_ROOT="/var/backups/ris"
RIS_APP_DIR="/home/resakse/Coding/reez"
DB_NAME="ris_production"
DB_USER="ris_user"
RETENTION_DAYS=30
BACKUP_ENCRYPTION_KEY=""
S3_BUCKET=""
S3_REGION="us-east-1"

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

log "Setting up comprehensive backup strategy for AI-Powered RIS..."

# 1. Create backup directory structure
log "Creating backup directory structure..."
mkdir -p "$BACKUP_ROOT"/{database,files,config,logs,ai-models,full-system}/{daily,weekly,monthly}
mkdir -p "$BACKUP_ROOT"/temp
mkdir -p /var/log/ris-backup

# Set proper permissions
chown -R postgres:postgres "$BACKUP_ROOT/database"
chown -R root:root "$BACKUP_ROOT"/{files,config,logs,ai-models,full-system}
chmod 700 "$BACKUP_ROOT"

# 2. Generate encryption key if not provided
generate_encryption_key() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
    BACKUP_ENCRYPTION_KEY=$(generate_encryption_key)
    log "Generated backup encryption key: $BACKUP_ENCRYPTION_KEY"
    echo "$BACKUP_ENCRYPTION_KEY" > /root/.ris_backup_key
    chmod 600 /root/.ris_backup_key
    warn "Backup encryption key saved to /root/.ris_backup_key - please save it securely!"
fi

# 3. Install backup dependencies
log "Installing backup dependencies..."
apt update
apt install -y \
    postgresql-client \
    pigz \
    pv \
    rsync \
    gpg \
    awscli \
    duplicity \
    rdiff-backup

# 4. Create database backup script
log "Creating database backup script..."
cat > /usr/local/bin/ris-database-backup.sh << EOF
#!/bin/bash

# RIS Database Backup Script
set -euo pipefail

BACKUP_DIR="$BACKUP_ROOT/database"
DB_NAME="$DB_NAME"
DB_USER="$DB_USER"
ENCRYPTION_KEY="\$(cat /root/.ris_backup_key 2>/dev/null || echo '')"
DATE=\$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/ris-backup/database_backup.log"

# Function to log with timestamp
log_message() {
    echo "\$(date '+%Y-%m-%d %H:%M:%S') - \$1" | tee -a "\$LOG_FILE"
}

log_message "Starting database backup..."

# Check if database is accessible
if ! sudo -u postgres psql -U "\$DB_USER" -d "\$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
    log_message "ERROR: Cannot connect to database"
    exit 1
fi

# Create database dump
DUMP_FILE="\$BACKUP_DIR/temp/\${DB_NAME}_\${DATE}.sql"
log_message "Creating database dump..."

sudo -u postgres pg_dump -U "\$DB_USER" -h localhost -d "\$DB_NAME" \\
    --verbose --no-owner --no-privileges --create --if-exists \\
    --format=plain > "\$DUMP_FILE" 2>>\$LOG_FILE

if [ \$? -eq 0 ]; then
    log_message "Database dump created successfully: \$DUMP_FILE"
else
    log_message "ERROR: Database dump failed"
    exit 1
fi

# Compress the dump
log_message "Compressing database dump..."
COMPRESSED_FILE="\$BACKUP_DIR/daily/\${DB_NAME}_\${DATE}.sql.gz"
pv "\$DUMP_FILE" | pigz > "\$COMPRESSED_FILE"

# Encrypt if key is available
if [ -n "\$ENCRYPTION_KEY" ]; then
    log_message "Encrypting database backup..."
    gpg --symmetric --cipher-algo AES256 --batch --yes --passphrase "\$ENCRYPTION_KEY" \\
        --output "\${COMPRESSED_FILE}.gpg" "\$COMPRESSED_FILE"
    rm "\$COMPRESSED_FILE"
    FINAL_FILE="\${COMPRESSED_FILE}.gpg"
else
    FINAL_FILE="\$COMPRESSED_FILE"
fi

# Clean up temp file
rm "\$DUMP_FILE"

# Verify backup integrity
if [ -f "\$FINAL_FILE" ]; then
    BACKUP_SIZE=\$(du -h "\$FINAL_FILE" | cut -f1)
    log_message "Database backup completed: \$FINAL_FILE (\$BACKUP_SIZE)"
else
    log_message "ERROR: Backup file not found after creation"
    exit 1
fi

# Create weekly backup (Sunday)
if [ \$(date +%u) -eq 7 ]; then
    WEEKLY_FILE="\$BACKUP_DIR/weekly/\$(basename "\$FINAL_FILE")"
    cp "\$FINAL_FILE" "\$WEEKLY_FILE"
    log_message "Weekly backup created: \$WEEKLY_FILE"
fi

# Create monthly backup (1st of month)
if [ \$(date +%d) -eq 01 ]; then
    MONTHLY_FILE="\$BACKUP_DIR/monthly/\$(basename "\$FINAL_FILE")"
    cp "\$FINAL_FILE" "\$MONTHLY_FILE"
    log_message "Monthly backup created: \$MONTHLY_FILE"
fi

log_message "Database backup process completed successfully"
EOF

chmod +x /usr/local/bin/ris-database-backup.sh

# 5. Create files backup script
cat > /usr/local/bin/ris-files-backup.sh << EOF
#!/bin/bash

# RIS Files Backup Script
set -euo pipefail

BACKUP_DIR="$BACKUP_ROOT/files"
APP_DIR="$RIS_APP_DIR"
MEDIA_ROOT="/var/www/ris/media"
STATIC_ROOT="/var/www/ris/static"
ENCRYPTION_KEY="\$(cat /root/.ris_backup_key 2>/dev/null || echo '')"
DATE=\$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/ris-backup/files_backup.log"

# Function to log with timestamp
log_message() {
    echo "\$(date '+%Y-%m-%d %H:%M:%S') - \$1" | tee -a "\$LOG_FILE"
}

log_message "Starting files backup..."

# Create temporary backup directory
TEMP_DIR="\$BACKUP_DIR/temp/files_\$DATE"
mkdir -p "\$TEMP_DIR"

# Backup application files (excluding sensitive/temporary files)
if [ -d "\$APP_DIR" ]; then
    log_message "Backing up application files..."
    rsync -av "\$APP_DIR/" "\$TEMP_DIR/application/" \\
        --exclude="db.sqlite3" \\
        --exclude="*.pyc" \\
        --exclude="__pycache__" \\
        --exclude="node_modules" \\
        --exclude=".git" \\
        --exclude="venv" \\
        --exclude="*.log" \\
        --exclude="temp/" \\
        --exclude="out/" >> \$LOG_FILE 2>&1
fi

# Backup media files (DICOM images, reports, etc.)
if [ -d "\$MEDIA_ROOT" ]; then
    log_message "Backing up media files..."
    rsync -av "\$MEDIA_ROOT/" "\$TEMP_DIR/media/" >> \$LOG_FILE 2>&1
fi

# Backup static files
if [ -d "\$STATIC_ROOT" ]; then
    log_message "Backing up static files..."
    rsync -av "\$STATIC_ROOT/" "\$TEMP_DIR/static/" >> \$LOG_FILE 2>&1
fi

# Create compressed archive
log_message "Creating compressed archive..."
ARCHIVE_FILE="\$BACKUP_DIR/daily/files_\${DATE}.tar.gz"
cd "\$BACKUP_DIR/temp"
tar czf "\$ARCHIVE_FILE" "files_\$DATE/" 2>>\$LOG_FILE

# Encrypt if key is available
if [ -n "\$ENCRYPTION_KEY" ]; then
    log_message "Encrypting files backup..."
    gpg --symmetric --cipher-algo AES256 --batch --yes --passphrase "\$ENCRYPTION_KEY" \\
        --output "\${ARCHIVE_FILE}.gpg" "\$ARCHIVE_FILE"
    rm "\$ARCHIVE_FILE"
    FINAL_FILE="\${ARCHIVE_FILE}.gpg"
else
    FINAL_FILE="\$ARCHIVE_FILE"
fi

# Clean up temp directory
rm -rf "\$TEMP_DIR"

# Verify backup
if [ -f "\$FINAL_FILE" ]; then
    BACKUP_SIZE=\$(du -h "\$FINAL_FILE" | cut -f1)
    log_message "Files backup completed: \$FINAL_FILE (\$BACKUP_SIZE)"
else
    log_message "ERROR: Files backup failed"
    exit 1
fi

# Create weekly and monthly backups
if [ \$(date +%u) -eq 7 ]; then
    cp "\$FINAL_FILE" "\$BACKUP_DIR/weekly/\$(basename "\$FINAL_FILE")"
    log_message "Weekly files backup created"
fi

if [ \$(date +%d) -eq 01 ]; then
    cp "\$FINAL_FILE" "\$BACKUP_DIR/monthly/\$(basename "\$FINAL_FILE")"
    log_message "Monthly files backup created"
fi

log_message "Files backup process completed successfully"
EOF

chmod +x /usr/local/bin/ris-files-backup.sh

# 6. Create configuration backup script
cat > /usr/local/bin/ris-config-backup.sh << EOF
#!/bin/bash

# RIS Configuration Backup Script
set -euo pipefail

BACKUP_DIR="$BACKUP_ROOT/config"
ENCRYPTION_KEY="\$(cat /root/.ris_backup_key 2>/dev/null || echo '')"
DATE=\$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/ris-backup/config_backup.log"

# Function to log with timestamp
log_message() {
    echo "\$(date '+%Y-%m-%d %H:%M:%S') - \$1" | tee -a "\$LOG_FILE"
}

log_message "Starting configuration backup..."

# Create temporary backup directory
TEMP_DIR="\$BACKUP_DIR/temp/config_\$DATE"
mkdir -p "\$TEMP_DIR"

# Backup system configurations
CONFIG_DIRS=(
    "/etc/nginx"
    "/etc/postgresql"
    "/etc/redis"
    "/etc/systemd/system"
    "/etc/cron.d"
    "/etc/logrotate.d"
    "/opt/ris-monitoring"
)

for dir in "\${CONFIG_DIRS[@]}"; do
    if [ -d "\$dir" ]; then
        log_message "Backing up \$dir..."
        rsync -av "\$dir/" "\$TEMP_DIR/\$(basename "\$dir")/" >> \$LOG_FILE 2>&1
    fi
done

# Backup environment files (without sensitive data)
if [ -f "/home/resakse/Coding/reez/deployment/production.env" ]; then
    log_message "Backing up environment configuration..."
    mkdir -p "\$TEMP_DIR/env"
    # Remove sensitive lines and copy
    grep -v -E "(PASSWORD|SECRET|KEY)" "/home/resakse/Coding/reez/deployment/production.env" > "\$TEMP_DIR/env/production.env.template" || true
fi

# Backup crontabs
log_message "Backing up crontabs..."
mkdir -p "\$TEMP_DIR/crontabs"
crontab -l > "\$TEMP_DIR/crontabs/root.cron" 2>/dev/null || true
getent passwd | while IFS: read -r user x uid gid gecos home shell; do
    if [ "\$uid" -ge 1000 ] && [ "\$uid" -le 60000 ]; then
        sudo -u "\$user" crontab -l > "\$TEMP_DIR/crontabs/\${user}.cron" 2>/dev/null || true
    fi
done

# Create system info snapshot
log_message "Creating system information snapshot..."
mkdir -p "\$TEMP_DIR/system-info"
{
    echo "Hostname: \$(hostname)"
    echo "Date: \$(date)"
    echo "Kernel: \$(uname -a)"
    echo "OS: \$(lsb_release -a 2>/dev/null || cat /etc/os-release)"
    echo "Installed packages:"
    dpkg -l
} > "\$TEMP_DIR/system-info/system-snapshot.txt"

# Network configuration
ip addr show > "\$TEMP_DIR/system-info/network-config.txt"
ss -tlnp > "\$TEMP_DIR/system-info/listening-ports.txt"

# Create compressed archive
log_message "Creating compressed archive..."
ARCHIVE_FILE="\$BACKUP_DIR/daily/config_\${DATE}.tar.gz"
cd "\$BACKUP_DIR/temp"
tar czf "\$ARCHIVE_FILE" "config_\$DATE/" 2>>\$LOG_FILE

# Encrypt if key is available
if [ -n "\$ENCRYPTION_KEY" ]; then
    log_message "Encrypting configuration backup..."
    gpg --symmetric --cipher-algo AES256 --batch --yes --passphrase "\$ENCRYPTION_KEY" \\
        --output "\${ARCHIVE_FILE}.gpg" "\$ARCHIVE_FILE"
    rm "\$ARCHIVE_FILE"
    FINAL_FILE="\${ARCHIVE_FILE}.gpg"
else
    FINAL_FILE="\$ARCHIVE_FILE"
fi

# Clean up temp directory
rm -rf "\$TEMP_DIR"

# Verify backup
if [ -f "\$FINAL_FILE" ]; then
    BACKUP_SIZE=\$(du -h "\$FINAL_FILE" | cut -f1)
    log_message "Configuration backup completed: \$FINAL_FILE (\$BACKUP_SIZE)"
else
    log_message "ERROR: Configuration backup failed"
    exit 1
fi

log_message "Configuration backup process completed successfully"
EOF

chmod +x /usr/local/bin/ris-config-backup.sh

# 7. Create AI models backup script
cat > /usr/local/bin/ris-ai-models-backup.sh << EOF
#!/bin/bash

# RIS AI Models Backup Script
set -euo pipefail

BACKUP_DIR="$BACKUP_ROOT/ai-models"
OLLAMA_DATA_DIR="/usr/share/ollama/.ollama"
ENCRYPTION_KEY="\$(cat /root/.ris_backup_key 2>/dev/null || echo '')"
DATE=\$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/ris-backup/ai_models_backup.log"

# Function to log with timestamp
log_message() {
    echo "\$(date '+%Y-%m-%d %H:%M:%S') - \$1" | tee -a "\$LOG_FILE"
}

log_message "Starting AI models backup..."

# Check if Ollama is installed and has models
if ! command -v ollama >/dev/null 2>&1; then
    log_message "Ollama not installed, skipping AI models backup"
    exit 0
fi

# List available models
log_message "Checking available AI models..."
MODELS=\$(ollama list 2>/dev/null | tail -n +2 | awk '{print \$1}' | grep -v "^NAME\$" || true)

if [ -z "\$MODELS" ]; then
    log_message "No AI models found, skipping backup"
    exit 0
fi

# Create temporary backup directory
TEMP_DIR="\$BACKUP_DIR/temp/ai_models_\$DATE"
mkdir -p "\$TEMP_DIR"

log_message "Found models: \$MODELS"

# Backup Ollama data directory (contains model files)
if [ -d "\$OLLAMA_DATA_DIR" ]; then
    log_message "Backing up Ollama data directory..."
    rsync -av "\$OLLAMA_DATA_DIR/" "\$TEMP_DIR/ollama-data/" >> \$LOG_FILE 2>&1
fi

# Export model information
log_message "Exporting model information..."
{
    echo "AI Models Backup Information"
    echo "=========================="
    echo "Date: \$(date)"
    echo "Ollama Version: \$(ollama --version 2>/dev/null || echo 'Unknown')"
    echo ""
    echo "Installed Models:"
    ollama list 2>/dev/null || echo "Could not list models"
} > "\$TEMP_DIR/models-info.txt"

# Create compressed archive
log_message "Creating compressed archive..."
ARCHIVE_FILE="\$BACKUP_DIR/daily/ai_models_\${DATE}.tar.gz"
cd "\$BACKUP_DIR/temp"
tar czf "\$ARCHIVE_FILE" "ai_models_\$DATE/" 2>>\$LOG_FILE

# Encrypt if key is available
if [ -n "\$ENCRYPTION_KEY" ]; then
    log_message "Encrypting AI models backup..."
    gpg --symmetric --cipher-algo AES256 --batch --yes --passphrase "\$ENCRYPTION_KEY" \\
        --output "\${ARCHIVE_FILE}.gpg" "\$ARCHIVE_FILE"
    rm "\$ARCHIVE_FILE"
    FINAL_FILE="\${ARCHIVE_FILE}.gpg"
else
    FINAL_FILE="\$ARCHIVE_FILE"
fi

# Clean up temp directory
rm -rf "\$TEMP_DIR"

# Verify backup
if [ -f "\$FINAL_FILE" ]; then
    BACKUP_SIZE=\$(du -h "\$FINAL_FILE" | cut -f1)
    log_message "AI models backup completed: \$FINAL_FILE (\$BACKUP_SIZE)"
else
    log_message "ERROR: AI models backup failed"
    exit 1
fi

log_message "AI models backup process completed successfully"
EOF

chmod +x /usr/local/bin/ris-ai-models-backup.sh

# 8. Create master backup script
cat > /usr/local/bin/ris-full-backup.sh << EOF
#!/bin/bash

# RIS Master Backup Script - Coordinates all backup operations
set -euo pipefail

LOG_FILE="/var/log/ris-backup/full_backup.log"
BACKUP_SUCCESS=true

# Function to log with timestamp
log_message() {
    echo "\$(date '+%Y-%m-%d %H:%M:%S') - \$1" | tee -a "\$LOG_FILE"
}

# Function to run backup component
run_backup() {
    local backup_name="\$1"
    local backup_script="\$2"
    
    log_message "Starting \$backup_name backup..."
    
    if [ -x "\$backup_script" ]; then
        if "\$backup_script"; then
            log_message "\$backup_name backup completed successfully"
        else
            log_message "ERROR: \$backup_name backup failed"
            BACKUP_SUCCESS=false
        fi
    else
        log_message "ERROR: \$backup_name backup script not found or not executable: \$backup_script"
        BACKUP_SUCCESS=false
    fi
    
    log_message "---"
}

log_message "========================================="
log_message "Starting RIS Full Backup Process"
log_message "========================================="

# Run all backup components
run_backup "Database" "/usr/local/bin/ris-database-backup.sh"
run_backup "Files" "/usr/local/bin/ris-files-backup.sh"
run_backup "Configuration" "/usr/local/bin/ris-config-backup.sh"
run_backup "AI Models" "/usr/local/bin/ris-ai-models-backup.sh"

# Cleanup old backups
log_message "Cleaning up old backups..."
find "$BACKUP_ROOT" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>>\$LOG_FILE || true
find "$BACKUP_ROOT" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>>\$LOG_FILE || true
find "$BACKUP_ROOT" -name "*.gpg" -mtime +$RETENTION_DAYS -delete 2>>\$LOG_FILE || true

# Generate backup report
BACKUP_SIZE=\$(du -sh "$BACKUP_ROOT" | cut -f1)
log_message "========================================="
log_message "RIS Full Backup Process Completed"
log_message "Total backup size: \$BACKUP_SIZE"
log_message "Status: \$([ \$BACKUP_SUCCESS == true ] && echo 'SUCCESS' || echo 'FAILED')"
log_message "========================================="

# Send email notification if configured
if command -v mail >/dev/null 2>&1 && [ -n "\${ALERT_EMAIL:-}" ]; then
    SUBJECT="RIS Backup \$([ \$BACKUP_SUCCESS == true ] && echo 'Success' || echo 'Failed') - \$(date +%Y-%m-%d)"
    tail -50 "\$LOG_FILE" | mail -s "\$SUBJECT" "\$ALERT_EMAIL"
fi

exit \$([ \$BACKUP_SUCCESS == true ] && echo 0 || echo 1)
EOF

chmod +x /usr/local/bin/ris-full-backup.sh

# 9. Create restore scripts
log "Creating restore scripts..."

# Database restore script
cat > /usr/local/bin/ris-database-restore.sh << EOF
#!/bin/bash

# RIS Database Restore Script
set -euo pipefail

if [ \$# -ne 1 ]; then
    echo "Usage: \$0 <backup_file>"
    echo "Example: \$0 /var/backups/ris/database/daily/ris_production_20240201_120000.sql.gz.gpg"
    exit 1
fi

BACKUP_FILE="\$1"
DB_NAME="$DB_NAME"
DB_USER="$DB_USER"
ENCRYPTION_KEY="\$(cat /root/.ris_backup_key 2>/dev/null || echo '')"
LOG_FILE="/var/log/ris-backup/database_restore.log"

# Function to log with timestamp
log_message() {
    echo "\$(date '+%Y-%m-%d %H:%M:%S') - \$1" | tee -a "\$LOG_FILE"
}

log_message "Starting database restore from: \$BACKUP_FILE"

if [ ! -f "\$BACKUP_FILE" ]; then
    log_message "ERROR: Backup file not found: \$BACKUP_FILE"
    exit 1
fi

# Check if file is encrypted
if [[ "\$BACKUP_FILE" == *.gpg ]]; then
    if [ -z "\$ENCRYPTION_KEY" ]; then
        log_message "ERROR: Backup is encrypted but no encryption key found"
        exit 1
    fi
    
    log_message "Decrypting backup file..."
    DECRYPTED_FILE="\${BACKUP_FILE%.gpg}"
    gpg --decrypt --batch --yes --passphrase "\$ENCRYPTION_KEY" \\
        --output "\$DECRYPTED_FILE" "\$BACKUP_FILE"
    BACKUP_FILE="\$DECRYPTED_FILE"
fi

# Extract if compressed
if [[ "\$BACKUP_FILE" == *.gz ]]; then
    log_message "Extracting compressed backup..."
    EXTRACTED_FILE="\${BACKUP_FILE%.gz}"
    gunzip -c "\$BACKUP_FILE" > "\$EXTRACTED_FILE"
    BACKUP_FILE="\$EXTRACTED_FILE"
fi

# Confirm restore
echo "WARNING: This will replace the current database!"
echo "Database: \$DB_NAME"
echo "Backup file: \$BACKUP_FILE"
read -p "Are you sure you want to continue? (y/N): " confirm

if [ "\$confirm" != "y" ] && [ "\$confirm" != "Y" ]; then
    log_message "Database restore cancelled by user"
    exit 0
fi

# Stop RIS services
log_message "Stopping RIS services..."
systemctl stop nginx || true
systemctl stop ris-django || true
systemctl stop ris-frontend || true

# Drop and recreate database
log_message "Recreating database..."
sudo -u postgres dropdb "\$DB_NAME" || true
sudo -u postgres createdb -O "\$DB_USER" "\$DB_NAME"

# Restore database
log_message "Restoring database from backup..."
sudo -u postgres psql -U "\$DB_USER" -d "\$DB_NAME" -f "\$BACKUP_FILE" >> \$LOG_FILE 2>&1

if [ \$? -eq 0 ]; then
    log_message "Database restore completed successfully"
else
    log_message "ERROR: Database restore failed"
    exit 1
fi

# Start RIS services
log_message "Starting RIS services..."
systemctl start ris-django
systemctl start ris-frontend
systemctl start nginx

log_message "Database restore process completed successfully"
EOF

chmod +x /usr/local/bin/ris-database-restore.sh

# 10. Set up automated backup schedule
log "Setting up backup schedule..."
cat > /tmp/ris_backup_cron << EOF
# RIS Production Backup Schedule

# Daily full backup at 2 AM
0 2 * * * /usr/local/bin/ris-full-backup.sh

# Database backup every 6 hours
0 */6 * * * /usr/local/bin/ris-database-backup.sh

# Weekly backup verification (Sunday at 4 AM)
0 4 * * 0 /usr/local/bin/ris-verify-backups.sh
EOF

# Install cron jobs
crontab -l 2>/dev/null > /tmp/current_cron || touch /tmp/current_cron
cat /tmp/current_cron /tmp/ris_backup_cron | crontab -
rm /tmp/ris_backup_cron /tmp/current_cron

# 11. Create backup verification script
cat > /usr/local/bin/ris-verify-backups.sh << EOF
#!/bin/bash

# RIS Backup Verification Script
set -euo pipefail

BACKUP_DIR="$BACKUP_ROOT"
LOG_FILE="/var/log/ris-backup/verification.log"
ENCRYPTION_KEY="\$(cat /root/.ris_backup_key 2>/dev/null || echo '')"

# Function to log with timestamp
log_message() {
    echo "\$(date '+%Y-%m-%d %H:%M:%S') - \$1" | tee -a "\$LOG_FILE"
}

log_message "Starting backup verification..."

# Verify database backups
log_message "Verifying database backups..."
find "\$BACKUP_DIR/database/daily" -name "*.sql.gz*" -mtime -7 | while read -r backup_file; do
    if [[ "\$backup_file" == *.gpg ]]; then
        if [ -n "\$ENCRYPTION_KEY" ]; then
            log_message "Verifying encrypted backup: \$backup_file"
            if gpg --decrypt --batch --yes --passphrase "\$ENCRYPTION_KEY" "\$backup_file" | gunzip | head -10 | grep -q "PostgreSQL database dump"; then
                log_message "✅ Valid: \$backup_file"
            else
                log_message "❌ Invalid: \$backup_file"
            fi
        else
            log_message "⚠️ Cannot verify encrypted backup (no key): \$backup_file"
        fi
    else
        log_message "Verifying backup: \$backup_file"
        if gunzip -t "\$backup_file"; then
            log_message "✅ Valid: \$backup_file"
        else
            log_message "❌ Invalid: \$backup_file"
        fi
    fi
done

# Check backup sizes and dates
log_message "Checking backup freshness..."
LATEST_DB_BACKUP=\$(find "\$BACKUP_DIR/database/daily" -name "*.sql.gz*" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
if [ -n "\$LATEST_DB_BACKUP" ]; then
    BACKUP_AGE=\$(stat -c %Y "\$LATEST_DB_BACKUP")
    CURRENT_TIME=\$(date +%s)
    AGE_HOURS=\$(( (CURRENT_TIME - BACKUP_AGE) / 3600 ))
    
    if [ \$AGE_HOURS -gt 48 ]; then
        log_message "⚠️ Latest database backup is \$AGE_HOURS hours old"
    else
        log_message "✅ Latest database backup is \$AGE_HOURS hours old"
    fi
else
    log_message "❌ No database backups found"
fi

log_message "Backup verification completed"
EOF

chmod +x /usr/local/bin/ris-verify-backups.sh

# 12. Create disaster recovery documentation
cat > "$BACKUP_ROOT/DISASTER_RECOVERY_PLAN.md" << 'EOF'
# RIS Disaster Recovery Plan

## Quick Recovery Steps

### 1. Database Recovery
```bash
# List available database backups
ls -la /var/backups/ris/database/daily/

# Restore database from backup
sudo /usr/local/bin/ris-database-restore.sh /var/backups/ris/database/daily/ris_production_YYYYMMDD_HHMMSS.sql.gz.gpg
```

### 2. Full System Recovery
```bash
# Stop all services
systemctl stop nginx ris-django ris-frontend

# Restore database (see above)

# Restore application files
cd /var/backups/ris/files/daily/
# Extract latest files backup
tar -xzf files_YYYYMMDD_HHMMSS.tar.gz
rsync -av files_YYYYMMDD_HHMMSS/application/ /home/resakse/Coding/reez/
rsync -av files_YYYYMMDD_HHMMSS/media/ /var/www/ris/media/

# Restore configuration
cd /var/backups/ris/config/daily/
tar -xzf config_YYYYMMDD_HHMMSS.tar.gz
# Manually restore configuration files as needed

# Start services
systemctl start ris-django ris-frontend nginx
```

### 3. AI Models Recovery
```bash
# Restore AI models
cd /var/backups/ris/ai-models/daily/
tar -xzf ai_models_YYYYMMDD_HHMMSS.tar.gz
rsync -av ai_models_YYYYMMDD_HHMMSS/ollama-data/ /usr/share/ollama/.ollama/
systemctl restart ollama
```

## Recovery Time Objectives (RTO)
- Database: 30 minutes
- Application files: 1 hour
- Full system: 2-4 hours

## Recovery Point Objectives (RPO)
- Database: 6 hours (backup frequency)
- Files: 24 hours
- Configuration: 24 hours

## Emergency Contacts
- System Administrator: [Contact]
- Database Administrator: [Contact]
- Vendor Support: [Contact]

## Backup Locations
- Primary: /var/backups/ris/
- Offsite: [S3/Cloud backup location]
- Encryption Key: /root/.ris_backup_key
EOF

# 13. Set proper permissions
chown -R root:root /usr/local/bin/ris-*-backup.sh /usr/local/bin/ris-*-restore.sh
chmod 700 /usr/local/bin/ris-*-backup.sh /usr/local/bin/ris-*-restore.sh
chown -R root:root "$BACKUP_ROOT"
chmod -R 700 "$BACKUP_ROOT"

# 14. Create backup status script
cat > /usr/local/bin/ris-backup-status.sh << EOF
#!/bin/bash

# RIS Backup Status Script
echo "========================================"
echo "RIS Backup Status Report"
echo "========================================"
echo "Generated: \$(date)"
echo

# Backup directory sizes
echo "BACKUP STORAGE USAGE"
echo "===================="
du -sh "$BACKUP_ROOT"/* 2>/dev/null | sort -hr

echo
echo "RECENT BACKUPS"
echo "=============="

# Database backups
echo "Database backups (last 7 days):"
find "$BACKUP_ROOT/database/daily" -name "*.sql.gz*" -mtime -7 -exec ls -lh {} \; | tail -5

# Files backups
echo
echo "Files backups (last 7 days):"
find "$BACKUP_ROOT/files/daily" -name "*.tar.gz*" -mtime -7 -exec ls -lh {} \; | tail -3

echo
echo "BACKUP VERIFICATION"
echo "=================="
if [ -f "/var/log/ris-backup/verification.log" ]; then
    echo "Last verification results:"
    tail -10 /var/log/ris-backup/verification.log
else
    echo "No verification log found"
fi

echo
echo "========================================"
EOF

chmod +x /usr/local/bin/ris-backup-status.sh

# 15. Test backup system
log "Testing backup system..."
if [ -x "/usr/local/bin/ris-database-backup.sh" ]; then
    log "Running initial database backup test..."
    /usr/local/bin/ris-database-backup.sh
    log "Database backup test completed"
fi

log "Backup strategy setup completed successfully!"

log "Created backup scripts:"
log "- Database backup: /usr/local/bin/ris-database-backup.sh"
log "- Files backup: /usr/local/bin/ris-files-backup.sh"
log "- Configuration backup: /usr/local/bin/ris-config-backup.sh"
log "- AI models backup: /usr/local/bin/ris-ai-models-backup.sh"
log "- Full backup: /usr/local/bin/ris-full-backup.sh"
log "- Database restore: /usr/local/bin/ris-database-restore.sh"
log "- Backup verification: /usr/local/bin/ris-verify-backups.sh"
log "- Backup status: /usr/local/bin/ris-backup-status.sh"

warn "Important next steps:"
warn "1. Secure the encryption key: /root/.ris_backup_key"
warn "2. Test restore procedures in a safe environment"
warn "3. Configure offsite backup storage (S3, etc.)"
warn "4. Review and adjust backup schedules as needed"
warn "5. Train staff on recovery procedures"
warn "6. Document backup retention policies"

log "Backup directories:"
log "- Main: $BACKUP_ROOT"
log "- Logs: /var/log/ris-backup/"
log "- Recovery plan: $BACKUP_ROOT/DISASTER_RECOVERY_PLAN.md"

log "Useful commands:"
log "- Full backup: sudo /usr/local/bin/ris-full-backup.sh"
log "- Backup status: sudo /usr/local/bin/ris-backup-status.sh"
log "- Verify backups: sudo /usr/local/bin/ris-verify-backups.sh"
log "- View backup logs: tail -f /var/log/ris-backup/*.log"