#!/bin/bash

# Ollama SystemD Service Configuration for Medical AI
# Creates production-ready systemd service with auto-start and reliability features

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

# Check if running with sudo privileges
check_privileges() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run with sudo privileges"
        echo "Usage: sudo $0"
        exit 1
    fi
}

# Create ollama user and group
create_ollama_user() {
    log "Creating ollama system user and group..."
    
    # Create ollama group if it doesn't exist
    if ! getent group ollama > /dev/null 2>&1; then
        groupadd --system ollama
        log "✅ Created ollama group"
    else
        log "ℹ️  ollama group already exists"
    fi
    
    # Create ollama user if it doesn't exist
    if ! getent passwd ollama > /dev/null 2>&1; then
        useradd --system --gid ollama --home-dir /usr/share/ollama --shell /bin/false --comment "Ollama AI service user" ollama
        log "✅ Created ollama system user"
    else
        log "ℹ️  ollama user already exists"
    fi
    
    # Create ollama home directory
    mkdir -p /usr/share/ollama
    chown ollama:ollama /usr/share/ollama
    chmod 755 /usr/share/ollama
    
    # Add ollama user to video group for GPU access
    usermod -a -G video ollama
    log "✅ Added ollama user to video group for GPU access"
}

# Create directories and set permissions
setup_directories() {
    log "Setting up Ollama directories and permissions..."
    
    # Create necessary directories
    directories=(
        "/var/log/ollama"
        "/var/lib/ollama"
        "/etc/ollama"
        "/usr/share/ollama/.ollama"
    )
    
    for dir in "${directories[@]}"; do
        mkdir -p "$dir"
        chown ollama:ollama "$dir"
        chmod 755 "$dir"
        log "✅ Created directory: $dir"
    done
    
    # Create log file
    touch /var/log/ollama/ollama.log
    chown ollama:ollama /var/log/ollama/ollama.log
    chmod 644 /var/log/ollama/ollama.log
}

# Create comprehensive systemd service file
create_systemd_service() {
    log "Creating Ollama systemd service configuration..."
    
    cat > /etc/systemd/system/ollama.service << 'EOF'
[Unit]
Description=Ollama AI Service for Medical Radiology
Documentation=https://github.com/ollama/ollama
After=network-online.target nvidia-persistenced.service
Wants=network-online.target
Requires=nvidia-persistenced.service

[Service]
Type=exec
ExecStart=/usr/local/bin/ollama serve
ExecReload=/bin/kill -HUP $MAINPID
KillMode=mixed
KillSignal=SIGINT
TimeoutStopSec=30
User=ollama
Group=ollama
WorkingDirectory=/usr/share/ollama

# Restart configuration
Restart=always
RestartSec=10
StartLimitInterval=60
StartLimitBurst=3

# Environment variables for medical AI optimization
Environment="HOME=/usr/share/ollama"
Environment="PATH=/usr/local/cuda/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="LD_LIBRARY_PATH=/usr/local/cuda/lib64:/usr/local/cuda/extras/CUPTI/lib64"

# Ollama configuration
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_MODELS=/usr/share/ollama/.ollama/models"
Environment="OLLAMA_LOGS=/var/log/ollama"

# GPU configuration for NVIDIA P40
Environment="CUDA_VISIBLE_DEVICES=0"
Environment="CUDA_DEVICE_ORDER=PCI_BUS_ID"
Environment="NVIDIA_VISIBLE_DEVICES=all"
Environment="NVIDIA_DRIVER_CAPABILITIES=compute,utility"

# Memory and performance optimization
Environment="OLLAMA_GPU_MEMORY_FRACTION=0.8"
Environment="OLLAMA_MAX_LOADED_MODELS=3"
Environment="OLLAMA_NUM_PARALLEL=2"
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KV_CACHE_TYPE=f16"

# Medical AI specific settings
Environment="OLLAMA_KEEP_ALIVE=300"
Environment="OLLAMA_CONCURRENT_REQUESTS=4"
Environment="OLLAMA_MAX_QUEUE_SIZE=100"
Environment="OLLAMA_REQUEST_TIMEOUT=120"

# Logging configuration
Environment="OLLAMA_DEBUG=false"
Environment="OLLAMA_LOG_LEVEL=info"
StandardOutput=append:/var/log/ollama/ollama.log
StandardError=append:/var/log/ollama/ollama.log

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/usr/share/ollama /var/log/ollama /var/lib/ollama /tmp
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes

# Resource limits
LimitNOFILE=65536
LimitNPROC=32768
MemoryMax=32G
TasksMax=16384

# Device access for GPU
DeviceAllow=/dev/nvidia0 rw
DeviceAllow=/dev/nvidia-uvm rw
DeviceAllow=/dev/nvidia-uvm-tools rw
DeviceAllow=/dev/nvidiactl rw
DeviceAllow=/dev/nvidia-modeset rw

[Install]
WantedBy=multi-user.target
EOF

    log "✅ Created systemd service file"
}

# Create service configuration override for medical AI
create_service_override() {
    log "Creating medical AI service override configuration..."
    
    mkdir -p /etc/systemd/system/ollama.service.d
    
    cat > /etc/systemd/system/ollama.service.d/medical-ai.conf << 'EOF'
[Unit]
Description=Ollama AI Service for Medical Radiology - P40 Optimized

[Service]
# Additional medical AI optimizations
Environment="OLLAMA_MEDICAL_MODE=true"
Environment="OLLAMA_PRIORITY_QUEUE=medical"

# Enhanced logging for medical applications
Environment="OLLAMA_AUDIT_LOG=true"
Environment="OLLAMA_PERFORMANCE_LOG=true"

# Medical data handling
Environment="OLLAMA_SECURE_MODE=true"
Environment="OLLAMA_CORS_ORIGINS=http://localhost:3000,http://localhost:8000"

# P40 Tesla specific optimizations
Environment="CUDA_CACHE_DISABLE=0"
Environment="CUDA_FORCE_PTX_JIT=1"
Environment="CUDA_DEVICE_MAX_CONNECTIONS=32"
Environment="TF_FORCE_GPU_ALLOW_GROWTH=true"
Environment="PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512"
EOF

    log "✅ Created medical AI service override"
}

# Create log rotation configuration
setup_log_rotation() {
    log "Setting up log rotation for Ollama..."
    
    cat > /etc/logrotate.d/ollama << 'EOF'
/var/log/ollama/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su ollama ollama
    postrotate
        systemctl reload ollama.service > /dev/null 2>&1 || true
    endscript
}
EOF

    log "✅ Created log rotation configuration"
}

# Create health check script
create_health_check() {
    log "Creating health check script..."
    
    cat > /usr/local/bin/ollama-health-check << 'EOF'
#!/bin/bash

# Ollama Health Check Script for Medical AI Service

OLLAMA_HOST="http://localhost:11434"
LOG_FILE="/var/log/ollama/health-check.log"
MAX_RESPONSE_TIME=10

log_health() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Check API responsiveness
check_api() {
    local start_time=$(date +%s)
    local response=$(curl -s -w "%{http_code}" -o /dev/null --max-time $MAX_RESPONSE_TIME "$OLLAMA_HOST/api/version")
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [ "$response" = "200" ] && [ $duration -le $MAX_RESPONSE_TIME ]; then
        log_health "API_CHECK: HEALTHY (${duration}s)"
        return 0
    else
        log_health "API_CHECK: UNHEALTHY (HTTP: $response, Duration: ${duration}s)"
        return 1
    fi
}

# Check GPU availability
check_gpu() {
    if nvidia-smi > /dev/null 2>&1; then
        local gpu_temp=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits)
        local gpu_mem=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
        
        if [ "$gpu_temp" -lt 85 ] && [ "$gpu_mem" -lt 20000 ]; then
            log_health "GPU_CHECK: HEALTHY (Temp: ${gpu_temp}°C, Memory: ${gpu_mem}MB)"
            return 0
        else
            log_health "GPU_CHECK: WARNING (Temp: ${gpu_temp}°C, Memory: ${gpu_mem}MB)"
            return 1
        fi
    else
        log_health "GPU_CHECK: FAILED (nvidia-smi not accessible)"
        return 1
    fi
}

# Check service status
check_service() {
    if systemctl is-active --quiet ollama; then
        log_health "SERVICE_CHECK: HEALTHY"
        return 0
    else
        log_health "SERVICE_CHECK: FAILED"
        return 1
    fi
}

# Main health check
main() {
    local exit_code=0
    
    check_service || exit_code=1
    check_api || exit_code=1
    check_gpu || exit_code=1
    
    if [ $exit_code -eq 0 ]; then
        log_health "OVERALL_STATUS: HEALTHY"
    else
        log_health "OVERALL_STATUS: UNHEALTHY"
    fi
    
    exit $exit_code
}

main "$@"
EOF

    chmod +x /usr/local/bin/ollama-health-check
    chown ollama:ollama /usr/local/bin/ollama-health-check
    
    log "✅ Created health check script"
}

# Create monitoring cron jobs
setup_monitoring() {
    log "Setting up monitoring cron jobs..."
    
    # Create cron job for health checks
    cat > /etc/cron.d/ollama-monitoring << 'EOF'
# Ollama Medical AI Monitoring Jobs
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin

# Health check every 5 minutes
*/5 * * * * ollama /usr/local/bin/ollama-health-check

# Daily log cleanup (keep logs under 1GB)
0 2 * * * root find /var/log/ollama -name "*.log" -size +100M -exec truncate -s 50M {} \;

# Weekly GPU memory cleanup (restart if needed)
0 3 * * 0 root /usr/local/bin/ollama-gpu-cleanup
EOF

    # Create GPU cleanup script
    cat > /usr/local/bin/ollama-gpu-cleanup << 'EOF'
#!/bin/bash

# GPU Memory Cleanup Script
LOG_FILE="/var/log/ollama/gpu-cleanup.log"

log_cleanup() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Check GPU memory usage
GPU_MEM_USED=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
GPU_MEM_TOTAL=24576  # P40 has 24GB

# If using more than 95% of GPU memory, restart Ollama service
if [ $GPU_MEM_USED -gt $((GPU_MEM_TOTAL * 95 / 100)) ]; then
    log_cleanup "High GPU memory usage detected: ${GPU_MEM_USED}MB / ${GPU_MEM_TOTAL}MB"
    log_cleanup "Restarting Ollama service to free GPU memory"
    systemctl restart ollama
    log_cleanup "Ollama service restarted"
else
    log_cleanup "GPU memory usage normal: ${GPU_MEM_USED}MB / ${GPU_MEM_TOTAL}MB"
fi
EOF

    chmod +x /usr/local/bin/ollama-gpu-cleanup
    
    log "✅ Created monitoring cron jobs"
}

# Create startup script
create_startup_script() {
    log "Creating Ollama startup script..."
    
    cat > /usr/local/bin/ollama-start << 'EOF'
#!/bin/bash

# Ollama Medical AI Startup Script

echo "Starting Ollama Medical AI Service..."

# Ensure GPU is ready
echo "Checking GPU status..."
nvidia-smi

# Set GPU to persistence mode
nvidia-smi -pm 1

# Set optimal GPU clocks for P40
nvidia-smi -ac 3505,875

# Start the service
echo "Starting Ollama service..."
systemctl start ollama

# Wait for service to be ready
echo "Waiting for Ollama to be ready..."
for i in {1..30}; do
    if curl -f -s http://localhost:11434/api/version > /dev/null; then
        echo "✅ Ollama is ready!"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 2
done

# Display status
echo "Service Status:"
systemctl status ollama --no-pager

echo "Available Models:"
ollama list 2>/dev/null || echo "No models loaded yet"

echo "GPU Status:"
nvidia-smi --query-gpu=name,temperature.gpu,memory.used,memory.total --format=csv
EOF

    chmod +x /usr/local/bin/ollama-start
    
    log "✅ Created startup script"
}

# Install and enable service
install_service() {
    log "Installing and enabling Ollama service..."
    
    # Reload systemd daemon
    systemctl daemon-reload
    
    # Enable service for auto-start
    systemctl enable ollama
    log "✅ Enabled Ollama service for auto-start"
    
    # Start the service
    systemctl start ollama
    log "✅ Started Ollama service"
    
    # Wait for service to be ready
    sleep 10
    
    # Check service status
    if systemctl is-active --quiet ollama; then
        log "✅ Ollama service is running successfully"
    else
        error "Failed to start Ollama service"
        systemctl status ollama --no-pager
        exit 1
    fi
}

# Verify installation
verify_installation() {
    log "Verifying Ollama service installation..."
    
    # Check service status
    echo "Service Status:"
    systemctl status ollama --no-pager
    
    # Check API
    echo ""
    echo "API Test:"
    curl -s http://localhost:11434/api/version | jq '.' 2>/dev/null || echo "API not ready yet"
    
    # Check logs
    echo ""
    echo "Recent Logs:"
    journalctl -u ollama --no-pager -n 10
    
    # Check health
    echo ""
    echo "Health Check:"
    /usr/local/bin/ollama-health-check
}

# Main execution
main() {
    echo "Ollama SystemD Service Setup for Medical AI"
    echo "==========================================="
    echo ""
    
    check_privileges
    create_ollama_user
    setup_directories
    create_systemd_service
    create_service_override
    setup_log_rotation
    create_health_check
    setup_monitoring
    create_startup_script
    install_service
    verify_installation
    
    echo ""
    echo -e "${GREEN}✅ Ollama systemd service setup completed successfully!${NC}"
    echo ""
    echo "Service Management Commands:"
    echo "  • Start service:    sudo systemctl start ollama"
    echo "  • Stop service:     sudo systemctl stop ollama"
    echo "  • Restart service:  sudo systemctl restart ollama"
    echo "  • Service status:   sudo systemctl status ollama"
    echo "  • View logs:        sudo journalctl -u ollama -f"
    echo "  • Health check:     sudo /usr/local/bin/ollama-health-check"
    echo ""
    echo "Monitoring:"
    echo "  • Log files:        /var/log/ollama/"
    echo "  • Configuration:    /etc/systemd/system/ollama.service"
    echo "  • Health checks:    Every 5 minutes via cron"
    echo ""
    echo "The service will automatically start on system boot."
}

# Execute main function
main "$@"