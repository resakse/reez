#!/bin/bash

# Comprehensive Ollama Verification and Testing Suite
# Tests all aspects of Ollama medical AI setup for RIS integration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
OLLAMA_HOST="http://localhost:11434"
TEST_RESULTS_FILE="/tmp/ollama-test-results.json"
LOG_FILE="/var/log/ollama-tests.log"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

log() {
    echo -e "${CYAN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE" 2>/dev/null || true
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED_TESTS++))
}

failure() {
    echo -e "${RED}❌ $1${NC}"
    echo "[FAILED] $1" >> "$LOG_FILE" 2>/dev/null || true
    ((FAILED_TESTS++))
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

test_header() {
    ((TOTAL_TESTS++))
    echo ""
    echo -e "${BLUE}=== Test $TOTAL_TESTS: $1 ===${NC}"
}

# System prerequisites test
test_system_prerequisites() {
    test_header "System Prerequisites"
    
    # Check NVIDIA drivers
    if command -v nvidia-smi &> /dev/null; then
        GPU_INFO=$(nvidia-smi --query-gpu=name,driver_version --format=csv,noheader,nounits)
        success "NVIDIA drivers installed: $GPU_INFO"
    else
        failure "NVIDIA drivers not found"
        return 1
    fi
    
    # Check CUDA
    if command -v nvcc &> /dev/null; then
        CUDA_VERSION=$(nvcc --version | grep release | awk '{print $6}' | cut -c2-)
        success "CUDA toolkit installed: $CUDA_VERSION"
    else
        warning "CUDA toolkit not found (not critical for Ollama)"
    fi
    
    # Check Ollama binary
    if command -v ollama &> /dev/null; then
        OLLAMA_VERSION=$(ollama --version 2>/dev/null || echo "Unknown")
        success "Ollama binary installed: $OLLAMA_VERSION"
    else
        failure "Ollama binary not found"
        return 1
    fi
    
    # Check disk space
    AVAILABLE_SPACE=$(df /usr/share/ollama 2>/dev/null | awk 'NR==2 {print $4}' || df / | awk 'NR==2 {print $4}')
    AVAILABLE_GB=$((AVAILABLE_SPACE / 1024 / 1024))
    
    if [ $AVAILABLE_GB -gt 50 ]; then
        success "Sufficient disk space: ${AVAILABLE_GB}GB available"
    else
        warning "Low disk space: ${AVAILABLE_GB}GB available (recommend 50GB+)"
    fi
}

# Service status test
test_service_status() {
    test_header "Ollama Service Status"
    
    # Check if service exists
    if systemctl list-unit-files | grep -q ollama.service; then
        success "Ollama systemd service exists"
    else
        failure "Ollama systemd service not found"
        return 1
    fi
    
    # Check service status
    if systemctl is-active --quiet ollama; then
        success "Ollama service is running"
    else
        failure "Ollama service is not running"
        echo "Service status:"
        systemctl status ollama --no-pager || true
        return 1
    fi
    
    # Check if enabled for auto-start
    if systemctl is-enabled --quiet ollama; then
        success "Ollama service enabled for auto-start"
    else
        warning "Ollama service not enabled for auto-start"
    fi
    
    # Check service logs for errors
    if journalctl -u ollama --no-pager -n 20 | grep -i error > /dev/null; then
        warning "Errors found in service logs - check with: journalctl -u ollama"
    else
        success "No recent errors in service logs"
    fi
}

# API connectivity test
test_api_connectivity() {
    test_header "API Connectivity"
    
    # Basic connectivity test
    if curl -f -s --max-time 10 "$OLLAMA_HOST/api/version" > /dev/null; then
        success "API endpoint is accessible"
    else
        failure "Cannot connect to API at $OLLAMA_HOST"
        return 1
    fi
    
    # Version check
    VERSION_RESPONSE=$(curl -s --max-time 10 "$OLLAMA_HOST/api/version" 2>/dev/null)
    if echo "$VERSION_RESPONSE" | jq -e '.version' > /dev/null 2>&1; then
        VERSION=$(echo "$VERSION_RESPONSE" | jq -r '.version')
        success "API version: $VERSION"
    else
        failure "Invalid API response format"
    fi
    
    # Response time test
    START_TIME=$(date +%s.%N)
    curl -f -s --max-time 10 "$OLLAMA_HOST/api/version" > /dev/null
    END_TIME=$(date +%s.%N)
    RESPONSE_TIME=$(echo "$END_TIME - $START_TIME" | bc 2>/dev/null || echo "N/A")
    
    if command -v bc &> /dev/null && (( $(echo "$RESPONSE_TIME < 2.0" | bc -l) )); then
        success "API response time: ${RESPONSE_TIME}s (good)"
    else
        warning "API response time: ${RESPONSE_TIME}s (may be slow)"
    fi
}

# GPU utilization test
test_gpu_utilization() {
    test_header "GPU Utilization"
    
    # Check GPU visibility
    GPU_COUNT=$(nvidia-smi --list-gpus | wc -l)
    success "GPUs detected: $GPU_COUNT"
    
    # Check GPU memory
    GPU_MEMORY=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)
    GPU_MEMORY_USED=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
    GPU_MEMORY_FREE=$((GPU_MEMORY - GPU_MEMORY_USED))
    
    log "GPU Memory: ${GPU_MEMORY_USED}MB used / ${GPU_MEMORY}MB total (${GPU_MEMORY_FREE}MB free)"
    
    if [ $GPU_MEMORY_FREE -gt 10000 ]; then
        success "Sufficient GPU memory available: ${GPU_MEMORY_FREE}MB"
    else
        warning "Low GPU memory available: ${GPU_MEMORY_FREE}MB"
    fi
    
    # Check GPU temperature
    GPU_TEMP=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits)
    if [ $GPU_TEMP -lt 80 ]; then
        success "GPU temperature: ${GPU_TEMP}°C (normal)"
    else
        warning "GPU temperature: ${GPU_TEMP}°C (high)"
    fi
    
    # Check GPU utilization
    GPU_UTIL=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits)
    log "GPU utilization: ${GPU_UTIL}%"
}

# Model availability test
test_model_availability() {
    test_header "Medical AI Model Availability"
    
    # Get list of models
    MODELS_RESPONSE=$(curl -s --max-time 10 "$OLLAMA_HOST/api/tags" 2>/dev/null)
    
    if ! echo "$MODELS_RESPONSE" | jq -e '.models' > /dev/null 2>&1; then
        failure "Cannot retrieve model list"
        return 1
    fi
    
    # Required medical models
    REQUIRED_MODELS=("llava-med:7b" "meditron:7b" "medalpaca:7b")
    CUSTOM_MODELS=("medical-vision" "medical-reports" "medical-qa")
    
    log "Checking required base models..."
    for model in "${REQUIRED_MODELS[@]}"; do
        if echo "$MODELS_RESPONSE" | jq -r '.models[].name' | grep -q "^$model$"; then
            success "Base model available: $model"
        else
            failure "Base model missing: $model"
        fi
    done
    
    log "Checking custom medical models..."
    for model in "${CUSTOM_MODELS[@]}"; do
        if echo "$MODELS_RESPONSE" | jq -r '.models[].name' | grep -q "^$model"; then
            success "Custom model available: $model"
        else
            warning "Custom model missing: $model (run medical models setup)"
        fi
    done
    
    # Count total models
    TOTAL_MODELS=$(echo "$MODELS_RESPONSE" | jq -r '.models | length')
    log "Total models available: $TOTAL_MODELS"
}

# Model inference test
test_model_inference() {
    test_header "Medical AI Model Inference"
    
    # Test prompts for medical models
    declare -A TEST_PROMPTS=(
        ["medical-vision"]="Describe the key anatomical structures visible in a chest X-ray."
        ["medical-reports"]="Create a basic template for a radiology report."
        ["medical-qa"]="What are the essential elements of a quality radiology report?"
        ["llava-med:7b"]="Explain the importance of proper patient positioning in medical imaging."
        ["meditron:7b"]="Describe the basic structure of a chest CT scan report."
        ["medalpaca:7b"]="What quality checks should be performed on medical imaging reports?"
    )
    
    for model in "${!TEST_PROMPTS[@]}"; do
        log "Testing model: $model"
        
        # Check if model exists
        if ! ollama list | grep -q "$model"; then
            warning "Model $model not found, skipping inference test"
            continue
        fi
        
        # Run inference test
        START_TIME=$(date +%s.%N)
        
        RESPONSE=$(curl -s --max-time 60 -X POST "$OLLAMA_HOST/api/generate" \
            -H "Content-Type: application/json" \
            -d "{
                \"model\": \"$model\",
                \"prompt\": \"${TEST_PROMPTS[$model]}\",
                \"stream\": false
            }" 2>/dev/null)
        
        END_TIME=$(date +%s.%N)
        
        if echo "$RESPONSE" | jq -e '.response' > /dev/null 2>&1; then
            INFERENCE_TIME=$(echo "$END_TIME - $START_TIME" | bc 2>/dev/null || echo "N/A")
            RESPONSE_TEXT=$(echo "$RESPONSE" | jq -r '.response')
            RESPONSE_LENGTH=${#RESPONSE_TEXT}
            
            if [ $RESPONSE_LENGTH -gt 50 ]; then
                success "Model $model: Working (${INFERENCE_TIME}s, ${RESPONSE_LENGTH} chars)"
            else
                failure "Model $model: Poor response quality (${RESPONSE_LENGTH} chars)"
            fi
        else
            failure "Model $model: Inference failed"
        fi
    done
}

# Performance benchmark test
test_performance_benchmark() {
    test_header "Performance Benchmark"
    
    log "Running performance benchmark..."
    
    # Simple benchmark with medical-vision model
    if ollama list | grep -q "medical-vision"; then
        MODEL="medical-vision"
    elif ollama list | grep -q "llava-med:7b"; then
        MODEL="llava-med:7b"
    else
        warning "No suitable model for benchmark test"
        return 0
    fi
    
    BENCHMARK_PROMPT="Describe the anatomical structures in a standard chest radiograph including the heart, lungs, ribs, and diaphragm."
    
    # Run multiple iterations
    ITERATIONS=3
    TOTAL_TIME=0
    SUCCESSFUL_RUNS=0
    
    for i in $(seq 1 $ITERATIONS); do
        log "Benchmark iteration $i/$ITERATIONS"
        
        START_TIME=$(date +%s.%N)
        
        RESPONSE=$(curl -s --max-time 60 -X POST "$OLLAMA_HOST/api/generate" \
            -H "Content-Type: application/json" \
            -d "{
                \"model\": \"$MODEL\",
                \"prompt\": \"$BENCHMARK_PROMPT\",
                \"stream\": false
            }" 2>/dev/null)
        
        END_TIME=$(date +%s.%N)
        
        if echo "$RESPONSE" | jq -e '.response' > /dev/null 2>&1; then
            ITERATION_TIME=$(echo "$END_TIME - $START_TIME" | bc 2>/dev/null || echo "0")
            TOTAL_TIME=$(echo "$TOTAL_TIME + $ITERATION_TIME" | bc 2>/dev/null || echo "$TOTAL_TIME")
            ((SUCCESSFUL_RUNS++))
        fi
    done
    
    if [ $SUCCESSFUL_RUNS -gt 0 ] && command -v bc &> /dev/null; then
        AVERAGE_TIME=$(echo "scale=2; $TOTAL_TIME / $SUCCESSFUL_RUNS" | bc)
        success "Average inference time: ${AVERAGE_TIME}s ($SUCCESSFUL_RUNS/$ITERATIONS successful)"
    else
        warning "Benchmark incomplete ($SUCCESSFUL_RUNS/$ITERATIONS successful)"
    fi
}

# Memory usage test
test_memory_usage() {
    test_header "Memory Usage Analysis"
    
    # System memory
    SYSTEM_MEM_TOTAL=$(free -m | awk 'NR==2{print $2}')
    SYSTEM_MEM_USED=$(free -m | awk 'NR==2{print $3}')
    SYSTEM_MEM_PERCENT=$((SYSTEM_MEM_USED * 100 / SYSTEM_MEM_TOTAL))
    
    log "System Memory: ${SYSTEM_MEM_USED}MB / ${SYSTEM_MEM_TOTAL}MB (${SYSTEM_MEM_PERCENT}%)"
    
    if [ $SYSTEM_MEM_PERCENT -lt 80 ]; then
        success "System memory usage normal: ${SYSTEM_MEM_PERCENT}%"
    else
        warning "High system memory usage: ${SYSTEM_MEM_PERCENT}%"
    fi
    
    # GPU memory
    GPU_MEM_TOTAL=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)
    GPU_MEM_USED=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
    GPU_MEM_PERCENT=$((GPU_MEM_USED * 100 / GPU_MEM_TOTAL))
    
    log "GPU Memory: ${GPU_MEM_USED}MB / ${GPU_MEM_TOTAL}MB (${GPU_MEM_PERCENT}%)"
    
    if [ $GPU_MEM_PERCENT -lt 90 ]; then
        success "GPU memory usage normal: ${GPU_MEM_PERCENT}%"
    else
        warning "High GPU memory usage: ${GPU_MEM_PERCENT}%"
    fi
    
    # Ollama process memory
    if pgrep ollama > /dev/null; then
        OLLAMA_MEM=$(ps -o pid,rss,comm -p $(pgrep ollama) | awk 'NR>1 {sum+=$2} END {print sum/1024}' 2>/dev/null || echo "0")
        log "Ollama process memory: ${OLLAMA_MEM}MB"
    fi
}

# Security and configuration test
test_security_configuration() {
    test_header "Security and Configuration"
    
    # Check service user
    OLLAMA_USER=$(systemctl show ollama -p User --value 2>/dev/null || echo "unknown")
    if [ "$OLLAMA_USER" = "ollama" ]; then
        success "Service running as dedicated user: $OLLAMA_USER"
    else
        warning "Service user: $OLLAMA_USER (recommend dedicated 'ollama' user)"
    fi
    
    # Check file permissions
    if [ -d "/usr/share/ollama" ]; then
        OLLAMA_DIR_PERMS=$(stat -c "%a" /usr/share/ollama 2>/dev/null || echo "unknown")
        if [ "$OLLAMA_DIR_PERMS" = "755" ] || [ "$OLLAMA_DIR_PERMS" = "750" ]; then
            success "Ollama directory permissions: $OLLAMA_DIR_PERMS"
        else
            warning "Ollama directory permissions: $OLLAMA_DIR_PERMS (check security)"
        fi
    fi
    
    # Check network binding
    OLLAMA_HOST_ENV=$(systemctl show ollama -p Environment --value | grep OLLAMA_HOST || echo "not set")
    log "Ollama host binding: $OLLAMA_HOST_ENV"
    
    # Check log files
    if [ -f "/var/log/ollama/ollama.log" ]; then
        success "Log file exists: /var/log/ollama/ollama.log"
        
        LOG_SIZE=$(du -h /var/log/ollama/ollama.log | cut -f1)
        log "Log file size: $LOG_SIZE"
    else
        warning "Log file not found at expected location"
    fi
}

# Generate test report
generate_test_report() {
    test_header "Test Report Generation"
    
    # Create JSON report
    cat > "$TEST_RESULTS_FILE" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "test_summary": {
        "total_tests": $TOTAL_TESTS,
        "passed_tests": $PASSED_TESTS,
        "failed_tests": $FAILED_TESTS,
        "success_rate": $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc 2>/dev/null || echo "0")
    },
    "system_info": {
        "gpu_name": "$(nvidia-smi --query-gpu=name --format=csv,noheader,nounits 2>/dev/null || echo 'unknown')",
        "gpu_memory": "$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null || echo 'unknown')MB",
        "gpu_driver": "$(nvidia-smi --query-gpu=driver_version --format=csv,noheader,nounits 2>/dev/null || echo 'unknown')",
        "ollama_version": "$(ollama --version 2>/dev/null | head -1 || echo 'unknown')",
        "system_memory": "$(free -m | awk 'NR==2{print $2}')MB"
    },
    "available_models": $(curl -s "$OLLAMA_HOST/api/tags" 2>/dev/null | jq '.models | length' || echo '0')
}
EOF

    success "Test report generated: $TEST_RESULTS_FILE"
    
    # Display summary
    echo ""
    echo -e "${BLUE}==================== TEST SUMMARY ====================${NC}"
    echo -e "${CYAN}Total Tests: $TOTAL_TESTS${NC}"
    echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
    echo -e "${RED}Failed: $FAILED_TESTS${NC}"
    
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed! Ollama medical AI setup is working correctly.${NC}"
    elif [ $FAILED_TESTS -lt $((TOTAL_TESTS / 2)) ]; then
        echo -e "${YELLOW}⚠️  Some tests failed, but core functionality appears to work.${NC}"
    else
        echo -e "${RED}❌ Multiple critical tests failed. Please review the setup.${NC}"
    fi
    
    echo -e "${BLUE}======================================================${NC}"
}

# Main execution
main() {
    echo -e "${BLUE}Ollama Medical AI Verification and Testing Suite${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo "Testing Ollama setup for RIS medical imaging integration"
    echo "Started at: $(date)"
    echo ""
    
    # Initialize log file
    touch "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/ollama-tests.log"
    
    # Run all tests
    test_system_prerequisites
    test_service_status
    test_api_connectivity
    test_gpu_utilization
    test_model_availability
    test_model_inference
    test_performance_benchmark
    test_memory_usage
    test_security_configuration
    generate_test_report
    
    # Cleanup
    echo ""
    echo "Test logs available at: $LOG_FILE"
    echo "Test results (JSON): $TEST_RESULTS_FILE"
    
    # Exit with appropriate code
    if [ $FAILED_TESTS -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

# Execute main function
main "$@"