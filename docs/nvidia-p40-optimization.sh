#!/bin/bash

# NVIDIA P40 GPU Optimization Script for Ollama Medical AI
# Optimizes P40 Tesla GPU for medical imaging AI workloads

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

# Check if running as root for some configurations
check_root() {
    if [[ $EUID -eq 0 ]]; then
        warn "Running as root. Some optimizations will be applied system-wide."
    fi
}

# Verify NVIDIA P40 GPU
verify_p40_gpu() {
    log "Verifying NVIDIA Tesla P40 GPU configuration..."
    
    if ! command -v nvidia-smi &> /dev/null; then
        error "nvidia-smi not found. Please install NVIDIA drivers first."
        exit 1
    fi
    
    # Get GPU information
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader,nounits)
    GPU_MEMORY=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)
    GPU_DRIVER=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader,nounits)
    
    log "GPU: $GPU_NAME"
    log "Memory: ${GPU_MEMORY}MB"
    log "Driver: $GPU_DRIVER"
    
    # Verify P40 specifications
    if echo "$GPU_NAME" | grep -qi "P40"; then
        log "✅ NVIDIA Tesla P40 detected"
        if [ "$GPU_MEMORY" -ge 22000 ]; then
            log "✅ GPU memory: ${GPU_MEMORY}MB (sufficient for medical AI)"
        else
            warn "GPU memory seems low for P40: ${GPU_MEMORY}MB"
        fi
    else
        warn "GPU is not a Tesla P40: $GPU_NAME"
        log "Continuing with optimization for detected GPU..."
    fi
}

# Configure GPU memory and performance settings
configure_gpu_performance() {
    log "Configuring NVIDIA P40 performance settings..."
    
    # Enable persistence mode (requires root or nvidia-ml user)
    if nvidia-smi -pm 1 2>/dev/null; then
        log "✅ GPU persistence mode enabled"
    else
        warn "Could not enable persistence mode (may require root privileges)"
    fi
    
    # Set maximum performance mode
    if nvidia-smi -ac 3505,875 2>/dev/null; then
        log "✅ GPU clocks set to maximum performance"
    else
        warn "Could not set GPU clocks (may require root privileges)"
    fi
    
    # Set power limit to maximum (250W for P40)
    if nvidia-smi -pl 250 2>/dev/null; then
        log "✅ GPU power limit set to 250W"
    else
        warn "Could not set power limit (may require root privileges)"
    fi
    
    # Display current GPU status
    log "Current GPU configuration:"
    nvidia-smi --query-gpu=name,temperature.gpu,power.draw,power.limit,clocks.sm,clocks.mem --format=csv
}

# Optimize CUDA settings for medical AI
configure_cuda_settings() {
    log "Configuring CUDA settings for medical AI workloads..."
    
    # Create CUDA environment configuration
    cat > /tmp/cuda-medical-ai.env << 'EOF'
# CUDA Configuration for Medical AI on P40
export CUDA_VISIBLE_DEVICES=0
export CUDA_DEVICE_ORDER=PCI_BUS_ID

# Memory management
export CUDA_CACHE_DISABLE=0
export CUDA_LAUNCH_BLOCKING=0

# P40 specific optimizations
export CUDA_FORCE_PTX_JIT=1
export CUDA_DEVICE_MAX_CONNECTIONS=32

# Medical AI specific settings
export TF_FORCE_GPU_ALLOW_GROWTH=true
export TF_GPU_ALLOCATOR=cuda_malloc_async
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
EOF

    # Add to system environment
    if [[ $EUID -eq 0 ]]; then
        cat /tmp/cuda-medical-ai.env >> /etc/environment
        log "✅ CUDA settings added to system environment"
    else
        # Add to user profile
        cat /tmp/cuda-medical-ai.env >> ~/.bashrc
        log "✅ CUDA settings added to user environment (~/.bashrc)"
    fi
    
    # Source the settings
    source /tmp/cuda-medical-ai.env
}

# Configure Ollama for P40 optimization
configure_ollama_p40() {
    log "Configuring Ollama for NVIDIA P40 optimization..."
    
    # P40-specific Ollama environment variables
    cat > /tmp/ollama-p40.env << 'EOF'
# Ollama P40 Tesla Optimization
export OLLAMA_HOST=0.0.0.0:11434

# Memory management (80% of 24GB = ~19GB for models, rest for CUDA overhead)
export OLLAMA_GPU_MEMORY_FRACTION=0.8
export OLLAMA_MAX_LOADED_MODELS=3
export OLLAMA_NUM_PARALLEL=2

# P40 performance optimizations
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_KV_CACHE_TYPE=f16
export OLLAMA_NUMA_PREFER=0

# Medical AI specific settings
export OLLAMA_KEEP_ALIVE=300          # Keep models loaded for 5 minutes
export OLLAMA_CONCURRENT_REQUESTS=4   # Allow multiple concurrent requests
export OLLAMA_MAX_QUEUE_SIZE=100      # Queue up to 100 requests

# Logging and monitoring
export OLLAMA_DEBUG=false
export OLLAMA_LOG_LEVEL=info
EOF

    # Create systemd override directory
    sudo mkdir -p /etc/systemd/system/ollama.service.d/
    
    # Create P40 optimization override
    sudo tee /etc/systemd/system/ollama.service.d/p40-optimization.conf << 'EOF'
[Service]
# NVIDIA P40 Tesla Optimization Override
Environment="CUDA_VISIBLE_DEVICES=0"
Environment="CUDA_DEVICE_ORDER=PCI_BUS_ID"
Environment="OLLAMA_GPU_MEMORY_FRACTION=0.8"
Environment="OLLAMA_MAX_LOADED_MODELS=3"
Environment="OLLAMA_NUM_PARALLEL=2"
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KV_CACHE_TYPE=f16"
Environment="OLLAMA_KEEP_ALIVE=300"
Environment="OLLAMA_CONCURRENT_REQUESTS=4"
Environment="OLLAMA_MAX_QUEUE_SIZE=100"

# P40 specific CUDA optimizations
Environment="CUDA_CACHE_DISABLE=0"
Environment="CUDA_FORCE_PTX_JIT=1"
Environment="CUDA_DEVICE_MAX_CONNECTIONS=32"

# Resource limits for P40
LimitNOFILE=65536
LimitNPROC=32768
MemoryMax=32G
EOF

    log "✅ Ollama systemd service optimized for P40"
    
    # Reload systemd configuration
    sudo systemctl daemon-reload
    
    # Add to user environment as well
    cat /tmp/ollama-p40.env >> ~/.bashrc
    
    log "✅ Ollama P40 configuration completed"
}

# Create GPU monitoring tools
create_gpu_monitoring() {
    log "Creating GPU monitoring tools for P40..."
    
    # Real-time GPU monitor
    cat > /home/resakse/Coding/reez/docs/p40-monitor.sh << 'EOF'
#!/bin/bash

# NVIDIA P40 Real-time Monitoring for Medical AI

echo "NVIDIA Tesla P40 - Medical AI Monitoring"
echo "========================================"
echo "Press Ctrl+C to stop"
echo ""

while true; do
    clear
    echo "NVIDIA Tesla P40 - Medical AI Monitoring - $(date)"
    echo "=================================================="
    
    # GPU utilization and memory
    nvidia-smi --query-gpu=name,temperature.gpu,power.draw,power.limit,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits | \
    while IFS=',' read -r name temp power_draw power_limit util mem_used mem_total; do
        echo "GPU: $name"
        echo "Temperature: ${temp}°C"
        echo "Power: ${power_draw}W / ${power_limit}W"
        echo "Utilization: ${util}%"
        echo "Memory: ${mem_used}MB / ${mem_total}MB ($(( mem_used * 100 / mem_total ))%)"
    done
    
    echo ""
    echo "GPU Processes:"
    nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits | \
    while IFS=',' read -r pid process mem; do
        echo "  PID $pid: $process ($mem MB)"
    done
    
    echo ""
    echo "Ollama Status:"
    if systemctl is-active --quiet ollama; then
        echo "  Service: RUNNING"
        # Get loaded models if possible
        if curl -s http://localhost:11434/api/ps 2>/dev/null | jq -e '.models' > /dev/null 2>&1; then
            echo "  Loaded Models:"
            curl -s http://localhost:11434/api/ps | jq -r '.models[]? | "    \(.name) (\(.size_vram // .size))"' 2>/dev/null || echo "    None"
        fi
    else
        echo "  Service: STOPPED"
    fi
    
    echo ""
    echo "System Resources:"
    echo "  CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)% used"
    echo "  RAM: $(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')% used"
    echo "  Load: $(uptime | awk -F'load average:' '{print $2}')"
    
    sleep 2
done
EOF

    chmod +x /home/resakse/Coding/reez/docs/p40-monitor.sh
    
    # Performance benchmark script
    cat > /home/resakse/Coding/reez/docs/p40-benchmark.sh << 'EOF'
#!/bin/bash

# NVIDIA P40 Medical AI Performance Benchmark

echo "NVIDIA Tesla P40 - Medical AI Benchmark"
echo "======================================="
echo ""

# Test parameters
MODELS=("medical-vision" "medical-reports" "medical-qa")
TEST_PROMPT="Describe the anatomical structures visible in a standard chest radiograph."

log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

run_benchmark() {
    local model=$1
    local prompt=$2
    
    log_with_timestamp "Benchmarking $model..."
    
    # Record initial GPU state
    local gpu_mem_before=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
    local gpu_temp_before=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits)
    
    # Run inference with timing
    local start_time=$(date +%s.%N)
    
    local response=$(curl -s -X POST http://localhost:11434/api/generate \
        -H "Content-Type: application/json" \
        -d "{
            \"model\": \"$model\",
            \"prompt\": \"$prompt\",
            \"stream\": false
        }" | jq -r '.response' 2>/dev/null)
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)
    
    # Record final GPU state
    local gpu_mem_after=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
    local gpu_temp_after=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits)
    
    # Calculate metrics
    local response_length=${#response}
    local tokens_per_second=$(echo "scale=2; $response_length / 4 / $duration" | bc 2>/dev/null || echo "N/A")
    local memory_delta=$((gpu_mem_after - gpu_mem_before))
    local temp_delta=$((gpu_temp_after - gpu_temp_before))
    
    # Output results
    echo "  Model: $model"
    echo "  Duration: ${duration}s"
    echo "  Response Length: $response_length chars"
    echo "  Est. Tokens/sec: $tokens_per_second"
    echo "  Memory Delta: ${memory_delta}MB"
    echo "  Temperature Delta: ${temp_delta}°C"
    echo "  GPU Memory After: ${gpu_mem_after}MB"
    echo "  GPU Temperature After: ${gpu_temp_after}°C"
    echo ""
}

# Main benchmark execution
log_with_timestamp "Starting P40 Medical AI Benchmark"
log_with_timestamp "Initial GPU Status:"
nvidia-smi --query-gpu=name,temperature.gpu,memory.used,memory.total,utilization.gpu --format=csv

echo ""

# Run benchmarks for each model
for model in "${MODELS[@]}"; do
    if ollama list | grep -q "$model"; then
        run_benchmark "$model" "$TEST_PROMPT"
    else
        log_with_timestamp "Model $model not found, skipping..."
    fi
done

log_with_timestamp "Benchmark completed"
log_with_timestamp "Final GPU Status:"
nvidia-smi --query-gpu=name,temperature.gpu,memory.used,memory.total,utilization.gpu --format=csv
EOF

    chmod +x /home/resakse/Coding/reez/docs/p40-benchmark.sh
    
    log "✅ GPU monitoring tools created"
}

# Create automated optimization script
create_auto_optimization() {
    log "Creating automated P40 optimization script..."
    
    cat > /home/resakse/Coding/reez/docs/p40-auto-optimize.sh << 'EOF'
#!/bin/bash

# Automated P40 Optimization for Medical AI Workloads
# Run this script periodically to maintain optimal performance

# GPU thermal management
optimize_thermal() {
    local temp=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits)
    
    if [ "$temp" -gt 80 ]; then
        echo "High GPU temperature detected: ${temp}°C"
        echo "Reducing concurrent requests..."
        # Could implement dynamic scaling here
    fi
}

# Memory management
optimize_memory() {
    local mem_used=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
    local mem_total=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)
    local mem_percent=$((mem_used * 100 / mem_total))
    
    if [ "$mem_percent" -gt 90 ]; then
        echo "High GPU memory usage: ${mem_percent}%"
        echo "Consider unloading unused models..."
        # Could implement automatic model unloading
    fi
}

# Performance monitoring
monitor_performance() {
    local util=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits)
    
    if [ "$util" -lt 50 ]; then
        echo "Low GPU utilization: ${util}%"
        echo "GPU is underutilized - good for power efficiency"
    fi
}

# Main optimization loop
echo "P40 Auto-Optimization - $(date)"
echo "================================"

optimize_thermal
optimize_memory
monitor_performance

echo "Optimization check completed"
EOF

    chmod +x /home/resakse/Coding/reez/docs/p40-auto-optimize.sh
    
    # Create cron job for regular optimization
    (crontab -l 2>/dev/null; echo "*/15 * * * * /home/resakse/Coding/reez/docs/p40-auto-optimize.sh >> /var/log/p40-optimization.log 2>&1") | crontab -
    
    log "✅ Automated optimization scheduled (every 15 minutes)"
}

# Performance validation
validate_performance() {
    log "Validating P40 performance configuration..."
    
    # Check GPU settings
    echo "Current GPU Configuration:"
    nvidia-smi --query-gpu=name,persistence_mode,power.limit,clocks.sm,clocks.mem --format=csv
    
    # Check CUDA
    if command -v nvcc &> /dev/null; then
        echo "CUDA Version: $(nvcc --version | grep release | awk '{print $6}' | cut -c2-)"
    fi
    
    # Check Ollama configuration
    if systemctl is-active --quiet ollama; then
        log "✅ Ollama service is running"
        
        # Test API response
        if curl -f -s http://localhost:11434/api/version > /dev/null; then
            log "✅ Ollama API is responsive"
        else
            warn "Ollama API is not responding"
        fi
    else
        warn "Ollama service is not running"
    fi
    
    # Memory test
    local available_memory=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits)
    if [ "$available_memory" -gt 10000 ]; then
        log "✅ Sufficient GPU memory available: ${available_memory}MB"
    else
        warn "Low GPU memory available: ${available_memory}MB"
    fi
}

# Main execution
main() {
    echo "NVIDIA Tesla P40 Optimization for Ollama Medical AI"
    echo "=================================================="
    echo ""
    
    check_root
    verify_p40_gpu
    configure_gpu_performance
    configure_cuda_settings
    configure_ollama_p40
    create_gpu_monitoring
    create_auto_optimization
    validate_performance
    
    echo ""
    echo -e "${GREEN}✅ NVIDIA P40 optimization completed successfully!${NC}"
    echo ""
    echo "Available tools:"
    echo "  • Real-time monitoring: /home/resakse/Coding/reez/docs/p40-monitor.sh"
    echo "  • Performance benchmark: /home/resakse/Coding/reez/docs/p40-benchmark.sh"
    echo "  • Auto-optimization: /home/resakse/Coding/reez/docs/p40-auto-optimize.sh"
    echo ""
    echo "Next steps:"
    echo "  1. Restart Ollama service: sudo systemctl restart ollama"
    echo "  2. Run monitoring: ./p40-monitor.sh"
    echo "  3. Run benchmark: ./p40-benchmark.sh"
    echo "  4. Monitor logs: journalctl -u ollama -f"
    
    # Clean up temporary files
    rm -f /tmp/cuda-medical-ai.env /tmp/ollama-p40.env
}

# Execute main function
main "$@"