#!/bin/bash

# Redis Setup and Configuration Script for AI-Powered RIS Production
# This script sets up Redis for caching, sessions, and real-time features

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REDIS_VERSION="7.0"
REDIS_PASSWORD=""
REDIS_MEMORY_MB=2048
REDIS_CONFIG_DIR="/etc/redis"
REDIS_DATA_DIR="/var/lib/redis"
REDIS_LOG_DIR="/var/log/redis"

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

# Generate secure password if not provided
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

log "Setting up Redis for AI-Powered RIS..."

# 1. Install Redis
log "Installing Redis $REDIS_VERSION..."
apt update
apt install -y redis-server redis-tools

# 2. Generate password if not provided
if [ -z "$REDIS_PASSWORD" ]; then
    REDIS_PASSWORD=$(generate_password)
    log "Generated Redis password: $REDIS_PASSWORD"
    echo "IMPORTANT: Save this Redis password securely: $REDIS_PASSWORD" > /tmp/redis_password.txt
    warn "Redis password saved to /tmp/redis_password.txt - please save it securely and delete the file"
fi

# 3. Create Redis directories
log "Creating Redis directories..."
mkdir -p "$REDIS_CONFIG_DIR"
mkdir -p "$REDIS_DATA_DIR"
mkdir -p "$REDIS_LOG_DIR"

# Set proper ownership
chown redis:redis "$REDIS_DATA_DIR"
chown redis:redis "$REDIS_LOG_DIR"
chmod 750 "$REDIS_DATA_DIR"
chmod 750 "$REDIS_LOG_DIR"

# 4. Configure Redis for production
log "Configuring Redis for production..."

# Backup original config
cp /etc/redis/redis.conf /etc/redis/redis.conf.backup

# Create production Redis configuration
cat > /etc/redis/redis.conf << EOF
# Redis Production Configuration for AI-Powered RIS
# =================================================

# Network configuration
bind 127.0.0.1 ::1
port 6379
protected-mode yes
tcp-backlog 511
timeout 300
tcp-keepalive 300

# General configuration
daemonize yes
supervised systemd
pidfile /var/run/redis/redis-server.pid
loglevel notice
logfile $REDIS_LOG_DIR/redis-server.log
syslog-enabled yes
syslog-ident redis
databases 16

# Security
requirepass $REDIS_PASSWORD
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command KEYS ""
rename-command CONFIG "CONFIG_a8b2c4d6e8f0"
rename-command SHUTDOWN "SHUTDOWN_a8b2c4d6e8f0"
rename-command DEBUG ""
rename-command EVAL ""

# Memory management
maxmemory ${REDIS_MEMORY_MB}mb
maxmemory-policy allkeys-lru
maxmemory-samples 5

# Persistence configuration
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir $REDIS_DATA_DIR

# Append only file
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
aof-load-truncated yes
aof-use-rdb-preamble yes

# Lua scripting
lua-time-limit 5000

# Slow log
slowlog-log-slower-than 10000
slowlog-max-len 128

# Latency monitoring
latency-monitor-threshold 100

# Event notification
notify-keyspace-events ""

# Client configuration
client-output-buffer-limit normal 0 0 0
client-output-buffer-limit replica 256mb 64mb 60
client-output-buffer-limit pubsub 32mb 8mb 60
client-query-buffer-limit 1gb

# Advanced configuration
hz 10
dynamic-hz yes
aof-rewrite-incremental-fsync yes
rdb-save-incremental-fsync yes

# TLS/SSL (uncomment if using SSL)
# port 0
# tls-port 6379
# tls-cert-file /path/to/redis.crt
# tls-key-file /path/to/redis.key
# tls-ca-cert-file /path/to/ca.crt

# Performance tuning
tcp-keepalive 60
timeout 0
EOF

# 5. Configure multiple Redis instances for different purposes
log "Setting up Redis instances for different services..."

# Create configuration for session storage (database 2)
cat > /etc/redis/redis-session.conf << EOF
# Redis Session Storage Instance
include /etc/redis/redis.conf
port 6380
pidfile /var/run/redis/redis-session.pid
logfile $REDIS_LOG_DIR/redis-session.log
dbfilename session-dump.rdb
dir $REDIS_DATA_DIR/session
databases 2
maxmemory 512mb
EOF

# Create configuration for cache (database 1)  
cat > /etc/redis/redis-cache.conf << EOF
# Redis Cache Instance
include /etc/redis/redis.conf
port 6381
pidfile /var/run/redis/redis-cache.pid
logfile $REDIS_LOG_DIR/redis-cache.log
dbfilename cache-dump.rdb
dir $REDIS_DATA_DIR/cache
databases 2
maxmemory 1024mb
maxmemory-policy allkeys-lru
EOF

# Create directories for instances
mkdir -p "$REDIS_DATA_DIR/session"
mkdir -p "$REDIS_DATA_DIR/cache"
chown -R redis:redis "$REDIS_DATA_DIR"

# 6. Create systemd service files for additional instances
log "Creating systemd service files..."

# Session Redis service
cat > /etc/systemd/system/redis-session.service << EOF
[Unit]
Description=Redis Session Storage
After=network.target

[Service]
Type=notify
ExecStart=/usr/bin/redis-server /etc/redis/redis-session.conf
ExecStop=/usr/bin/redis-cli -p 6380 -a $REDIS_PASSWORD shutdown
TimeoutStopSec=0
Restart=always
User=redis
Group=redis
RuntimeDirectory=redis
RuntimeDirectoryMode=0755

[Install]
WantedBy=multi-user.target
EOF

# Cache Redis service
cat > /etc/systemd/system/redis-cache.service << EOF
[Unit]
Description=Redis Cache
After=network.target

[Service]
Type=notify
ExecStart=/usr/bin/redis-server /etc/redis/redis-cache.conf
ExecStop=/usr/bin/redis-cli -p 6381 -a $REDIS_PASSWORD shutdown
TimeoutStopSec=0
Restart=always
User=redis
Group=redis
RuntimeDirectory=redis
RuntimeDirectoryMode=0755

[Install]
WantedBy=multi-user.target
EOF

# 7. Configure Redis monitoring script
log "Creating Redis monitoring script..."
cat > /usr/local/bin/redis-monitor.sh << EOF
#!/bin/bash

# Redis Monitoring Script for RIS
REDIS_PASSWORD="$REDIS_PASSWORD"

echo "=== Redis Status Report ==="
echo "Date: \$(date)"
echo

# Check Redis instances
for port in 6379 6380 6381; do
    echo "Redis Instance on Port \$port:"
    redis-cli -p \$port -a \$REDIS_PASSWORD ping 2>/dev/null || echo "  Not running"
    
    if redis-cli -p \$port -a \$REDIS_PASSWORD ping &>/dev/null; then
        echo "  Status: Running"
        echo "  Memory Usage: \$(redis-cli -p \$port -a \$REDIS_PASSWORD info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')"
        echo "  Connected Clients: \$(redis-cli -p \$port -a \$REDIS_PASSWORD info clients | grep connected_clients | cut -d: -f2 | tr -d '\r')"
        echo "  Total Commands: \$(redis-cli -p \$port -a \$REDIS_PASSWORD info stats | grep total_commands_processed | cut -d: -f2 | tr -d '\r')"
    fi
    echo
done

# Show slow queries
echo "Recent Slow Queries:"
redis-cli -a \$REDIS_PASSWORD slowlog get 5 2>/dev/null | head -20

echo "=== End Redis Status ==="
EOF

chmod +x /usr/local/bin/redis-monitor.sh

# 8. Create Redis maintenance script
cat > /usr/local/bin/redis-maintenance.sh << EOF
#!/bin/bash

# Redis Maintenance Script for RIS
REDIS_PASSWORD="$REDIS_PASSWORD"
LOG_FILE="/var/log/redis/maintenance.log"

echo "\$(date): Starting Redis maintenance..." >> \$LOG_FILE

# Function to maintain Redis instance
maintain_instance() {
    local port=\$1
    local name=\$2
    
    echo "\$(date): Maintaining \$name (port \$port)..." >> \$LOG_FILE
    
    # Check if instance is running
    if ! redis-cli -p \$port -a \$REDIS_PASSWORD ping &>/dev/null; then
        echo "\$(date): \$name is not running, skipping..." >> \$LOG_FILE
        return
    fi
    
    # Get memory info
    local memory_used=\$(redis-cli -p \$port -a \$REDIS_PASSWORD info memory | grep used_memory: | cut -d: -f2 | tr -d '\r')
    echo "\$(date): \$name memory usage: \$memory_used bytes" >> \$LOG_FILE
    
    # Clear expired keys (for cache instances)
    if [[ \$port -eq 6381 ]]; then
        redis-cli -p \$port -a \$REDIS_PASSWORD --scan --pattern "*" | head -1000 | xargs -I {} redis-cli -p \$port -a \$REDIS_PASSWORD ttl {} | grep -c "^-1\$" >> \$LOG_FILE
    fi
    
    # Reset slow log
    redis-cli -p \$port -a \$REDIS_PASSWORD slowlog reset >> \$LOG_FILE
}

# Maintain all instances
maintain_instance 6379 "Main Redis"
maintain_instance 6380 "Session Redis"
maintain_instance 6381 "Cache Redis"

echo "\$(date): Redis maintenance completed." >> \$LOG_FILE
EOF

chmod +x /usr/local/bin/redis-maintenance.sh

# 9. Configure log rotation
log "Configuring log rotation..."
cat > /etc/logrotate.d/redis << EOF
$REDIS_LOG_DIR/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 redis redis
    postrotate
        systemctl reload redis-server > /dev/null 2>&1 || true
        systemctl reload redis-session > /dev/null 2>&1 || true
        systemctl reload redis-cache > /dev/null 2>&1 || true
    endscript
}
EOF

# 10. Set up Redis backup script
log "Setting up Redis backup system..."
BACKUP_DIR="/var/backups/redis"
mkdir -p "$BACKUP_DIR"/{daily,weekly}
chown -R redis:redis "$BACKUP_DIR"

cat > /usr/local/bin/redis-backup.sh << EOF
#!/bin/bash

# Redis Backup Script for RIS
BACKUP_DIR="$BACKUP_DIR"
REDIS_PASSWORD="$REDIS_PASSWORD"
DATE=\$(date +%Y%m%d_%H%M%S)

echo "\$(date): Starting Redis backup..." >> /var/log/redis/backup.log

# Function to backup Redis instance
backup_instance() {
    local port=\$1
    local name=\$2
    local data_dir=\$3
    
    if redis-cli -p \$port -a \$REDIS_PASSWORD ping &>/dev/null; then
        # Trigger background save
        redis-cli -p \$port -a \$REDIS_PASSWORD bgsave
        
        # Wait for save to complete
        while [ "\$(redis-cli -p \$port -a \$REDIS_PASSWORD lastsave)" = "\$(redis-cli -p \$port -a \$REDIS_PASSWORD lastsave)" ]; do
            sleep 1
        done
        
        # Copy dump file
        if [ -f "\$data_dir/dump.rdb" ]; then
            cp "\$data_dir/dump.rdb" "\$BACKUP_DIR/daily/\${name}_\${DATE}.rdb"
            echo "\$(date): Backed up \$name to \${name}_\${DATE}.rdb" >> /var/log/redis/backup.log
        fi
        
        # Copy AOF file if it exists
        if [ -f "\$data_dir/appendonly.aof" ]; then
            cp "\$data_dir/appendonly.aof" "\$BACKUP_DIR/daily/\${name}_\${DATE}.aof"
            echo "\$(date): Backed up \$name AOF to \${name}_\${DATE}.aof" >> /var/log/redis/backup.log
        fi
    else
        echo "\$(date): \$name is not running, skipping backup" >> /var/log/redis/backup.log
    fi
}

# Backup all instances
backup_instance 6379 "main" "$REDIS_DATA_DIR"
backup_instance 6380 "session" "$REDIS_DATA_DIR/session"
backup_instance 6381 "cache" "$REDIS_DATA_DIR/cache"

# Create weekly backup (Sunday)
if [ \$(date +%u) -eq 7 ]; then
    cp -r "\$BACKUP_DIR/daily" "\$BACKUP_DIR/weekly/week_\$DATE"
    echo "\$(date): Created weekly backup" >> /var/log/redis/backup.log
fi

# Clean old backups (keep 7 days of daily, 4 weeks of weekly)
find "\$BACKUP_DIR/daily" -name "*.rdb" -mtime +7 -delete
find "\$BACKUP_DIR/daily" -name "*.aof" -mtime +7 -delete
find "\$BACKUP_DIR/weekly" -type d -mtime +28 -exec rm -rf {} +

echo "\$(date): Redis backup completed." >> /var/log/redis/backup.log
EOF

chmod +x /usr/local/bin/redis-backup.sh

# Add backup to crontab
(crontab -l 2>/dev/null; echo "0 3 * * * /usr/local/bin/redis-backup.sh") | crontab -

# 11. Configure system limits for Redis
log "Configuring system limits..."
cat >> /etc/security/limits.conf << EOF

# Redis limits
redis soft nofile 65536
redis hard nofile 65536
redis soft nproc 65536
redis hard nproc 65536
EOF

# Configure sysctl for Redis
cat > /etc/sysctl.d/redis.conf << EOF
# Redis system configuration
vm.overcommit_memory = 1
net.core.somaxconn = 65535
EOF

sysctl -p /etc/sysctl.d/redis.conf

# 12. Start and enable Redis services
log "Starting Redis services..."
systemctl daemon-reload
systemctl enable redis-server
systemctl enable redis-session
systemctl enable redis-cache

systemctl restart redis-server
systemctl start redis-session
systemctl start redis-cache

# 13. Test Redis connections
log "Testing Redis connections..."
sleep 5

for port in 6379 6380 6381; do
    if redis-cli -p $port -a "$REDIS_PASSWORD" ping >/dev/null 2>&1; then
        log "Redis on port $port: OK"
    else
        error "Redis on port $port: FAILED"
    fi
done

# 14. Create environment configuration
cat > /tmp/redis_env.txt << EOF
# Redis configuration for production.env
REDIS_URL=redis://:$REDIS_PASSWORD@localhost:6379/0
REDIS_CACHE_URL=redis://:$REDIS_PASSWORD@localhost:6381/0
REDIS_SESSION_URL=redis://:$REDIS_PASSWORD@localhost:6380/0
REDIS_PASSWORD=$REDIS_PASSWORD
EOF

log "Redis setup completed successfully!"
log "Main Redis: localhost:6379"
log "Session Redis: localhost:6380"
log "Cache Redis: localhost:6381"
log "Password saved to: /tmp/redis_password.txt"
log "Environment variables saved to: /tmp/redis_env.txt"

warn "Important next steps:"
warn "1. Save the Redis password securely"
warn "2. Update your production.env file with Redis credentials"
warn "3. Test Redis connections from your application"
warn "4. Configure application to use different Redis instances"
warn "5. Monitor Redis performance and memory usage"
warn "6. Set up Redis clustering if high availability is needed"

log "Useful commands:"
log "- Monitor Redis: sudo /usr/local/bin/redis-monitor.sh"
log "- Backup Redis: sudo /usr/local/bin/redis-backup.sh"
log "- Maintenance: sudo /usr/local/bin/redis-maintenance.sh"
log "- Check status: systemctl status redis-server redis-session redis-cache"