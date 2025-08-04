#!/bin/bash

# Ollama Medical AI Models Setup Script
# Optimized for NVIDIA P40 GPU (24GB VRAM) and RIS Medical Imaging

set -e

echo "=== Ollama Medical AI Models Setup ==="
echo "Optimized for NVIDIA P40 GPU and Medical Imaging Workloads"
echo ""

# Configuration
OLLAMA_HOST="http://localhost:11434"
MODELS_DIR="/usr/share/ollama/.ollama/models"
LOG_FILE="/var/log/ollama-setup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
    echo "[WARNING] $1" >> "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    echo "[ERROR] $1" >> "$LOG_FILE"
}

# Check if Ollama is running
check_ollama() {
    log "Checking Ollama service status..."
    
    if ! systemctl is-active --quiet ollama; then
        warn "Ollama service is not running. Starting..."
        sudo systemctl start ollama
        sleep 10
    fi
    
    # Test API connectivity
    if curl -f -s "$OLLAMA_HOST/api/version" > /dev/null; then
        log "Ollama API is accessible at $OLLAMA_HOST"
    else
        error "Cannot connect to Ollama API at $OLLAMA_HOST"
        exit 1
    fi
}

# Check GPU availability
check_gpu() {
    log "Checking NVIDIA GPU availability..."
    
    if ! command -v nvidia-smi &> /dev/null; then
        error "nvidia-smi not found. Please install NVIDIA drivers."
        exit 1
    fi
    
    GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits)
    log "GPU Information: $GPU_INFO"
    
    # Check for P40 or similar GPU
    if echo "$GPU_INFO" | grep -q "P40"; then
        log "NVIDIA Tesla P40 detected - perfect for medical AI workloads"
    else
        warn "GPU is not a Tesla P40. Continuing with detected GPU."
    fi
}

# Download medical models
download_medical_models() {
    log "Starting download of medical AI models..."
    log "This process may take 30-60 minutes depending on internet speed"
    
    # Array of medical models with descriptions
    declare -A MEDICAL_MODELS=(
        ["llava-med:7b"]="Medical Vision-Language Model for DICOM image analysis"
        ["meditron:7b"]="Medical Knowledge LLM for report generation"
        ["medalpaca:7b"]="Medical QA and validation model"
    )
    
    for model in "${!MEDICAL_MODELS[@]}"; do
        log "Downloading $model - ${MEDICAL_MODELS[$model]}"
        
        # Check if model already exists
        if ollama list | grep -q "$model"; then
            warn "$model already exists. Skipping download."
            continue
        fi
        
        # Download with progress monitoring
        echo -e "${BLUE}Downloading $model...${NC}"
        if ollama pull "$model"; then
            log "Successfully downloaded $model"
        else
            error "Failed to download $model"
            exit 1
        fi
    done
}

# Create optimized medical model configurations
create_optimized_models() {
    log "Creating optimized medical model configurations..."
    
    # Medical Vision Model (for DICOM analysis)
    cat > /tmp/medical-vision.modelfile << 'EOF'
FROM llava-med:7b

# Optimized parameters for medical imaging analysis
PARAMETER temperature 0.1          # Low temperature for consistent medical analysis
PARAMETER top_p 0.9               # Focused sampling for medical accuracy
PARAMETER top_k 40                # Limited vocabulary for medical terms
PARAMETER repeat_penalty 1.1      # Avoid repetition in medical reports
PARAMETER num_ctx 4096            # Context window for detailed image analysis
PARAMETER num_gpu 1               # Use GPU acceleration

SYSTEM """You are a specialized medical AI assistant trained in radiology and medical imaging analysis. 

Your role:
- Analyze DICOM images with clinical accuracy
- Identify anatomical structures and pathological findings
- Provide structured observations in medical terminology
- Maintain professional medical reporting standards
- Flag urgent or critical findings appropriately

Guidelines:
- Use precise medical terminology
- Structure findings systematically (e.g., by anatomical region)
- Indicate confidence levels for observations
- Suggest differential diagnoses when appropriate
- Recommend additional imaging if indicated
"""
EOF

    # Medical Report Generation Model
    cat > /tmp/medical-reports.modelfile << 'EOF'
FROM meditron:7b

PARAMETER temperature 0.2          # Slightly higher for natural language generation
PARAMETER top_p 0.95              # Good balance for medical writing
PARAMETER top_k 50                # Expanded vocabulary for report writing
PARAMETER repeat_penalty 1.1      
PARAMETER num_ctx 8192            # Larger context for comprehensive reports
PARAMETER num_gpu 1               

SYSTEM """You are a medical report generation AI specialized in radiology reporting.

Your responsibilities:
- Generate clear, structured radiology reports
- Follow standard medical report formatting (Indication, Technique, Findings, Impression)
- Use appropriate medical terminology and ICD-10 coding when applicable
- Ensure clinical accuracy and completeness
- Maintain consistency with institutional reporting standards

Report Structure:
1. CLINICAL HISTORY: Brief relevant clinical information
2. TECHNIQUE: Imaging protocol and parameters
3. FINDINGS: Detailed systematic analysis
4. IMPRESSION: Summary with key diagnoses and recommendations
"""
EOF

    # Medical QA and Validation Model
    cat > /tmp/medical-qa.modelfile << 'EOF'
FROM medalpaca:7b

PARAMETER temperature 0.1          # Very low for consistent validation
PARAMETER top_p 0.9               
PARAMETER top_k 30                # Focused vocabulary for QA
PARAMETER repeat_penalty 1.1      
PARAMETER num_ctx 4096            
PARAMETER num_gpu 1               

SYSTEM """You are a medical quality assurance AI that validates radiology reports and medical imaging analysis.

Your functions:
- Review radiology reports for accuracy and completeness
- Check for consistency between findings and impressions
- Verify appropriate use of medical terminology
- Identify missing critical elements
- Suggest improvements for clarity and precision
- Flag potential diagnostic discrepancies

Quality Criteria:
- Clinical accuracy and evidence-based conclusions
- Complete systematic analysis of all relevant structures
- Appropriate differential diagnoses
- Clear communication of urgent findings
- Proper medical terminology usage
"""
EOF

    # Create the optimized models
    log "Creating medical-vision model..."
    if ollama create medical-vision -f /tmp/medical-vision.modelfile; then
        log "Successfully created medical-vision model"
    else
        error "Failed to create medical-vision model"
    fi
    
    log "Creating medical-reports model..."
    if ollama create medical-reports -f /tmp/medical-reports.modelfile; then
        log "Successfully created medical-reports model"
    else
        error "Failed to create medical-reports model"
    fi
    
    log "Creating medical-qa model..."
    if ollama create medical-qa -f /tmp/medical-qa.modelfile; then
        log "Successfully created medical-qa model"
    else
        error "Failed to create medical-qa model"
    fi
    
    # Clean up temporary files
    rm /tmp/medical-*.modelfile
}

# Test model functionality
test_models() {
    log "Testing medical model functionality..."
    
    # Test medical vision model
    log "Testing medical-vision model..."
    VISION_TEST=$(curl -s -X POST "$OLLAMA_HOST/api/generate" \
        -H "Content-Type: application/json" \
        -d '{
            "model": "medical-vision",
            "prompt": "Describe the key anatomical structures visible in a standard PA chest radiograph.",
            "stream": false
        }' | jq -r '.response' 2>/dev/null)
    
    if [ ${#VISION_TEST} -gt 50 ]; then
        log "Medical vision model test: PASSED"
    else
        error "Medical vision model test: FAILED"
    fi
    
    # Test medical reports model
    log "Testing medical-reports model..."
    REPORTS_TEST=$(curl -s -X POST "$OLLAMA_HOST/api/generate" \
        -H "Content-Type: application/json" \
        -d '{
            "model": "medical-reports",
            "prompt": "Generate a template structure for a chest CT radiology report.",
            "stream": false
        }' | jq -r '.response' 2>/dev/null)
    
    if [ ${#REPORTS_TEST} -gt 50 ]; then
        log "Medical reports model test: PASSED"
    else
        error "Medical reports model test: FAILED"
    fi
    
    # Test medical QA model
    log "Testing medical-qa model..."
    QA_TEST=$(curl -s -X POST "$OLLAMA_HOST/api/generate" \
        -H "Content-Type: application/json" \
        -d '{
            "model": "medical-qa",
            "prompt": "What are the essential quality criteria for a radiology report?",
            "stream": false
        }' | jq -r '.response' 2>/dev/null)
    
    if [ ${#QA_TEST} -gt 50 ]; then
        log "Medical QA model test: PASSED"
    else
        error "Medical QA model test: FAILED"
    fi
}

# Monitor GPU memory usage
monitor_gpu_memory() {
    log "Current GPU memory usage:"
    nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv
    
    # Check loaded models
    log "Currently loaded models:"
    curl -s "$OLLAMA_HOST/api/ps" | jq '.models[] | {name: .name, size: .size}' 2>/dev/null || echo "No models currently loaded"
}

# Create medical AI test suite
create_test_suite() {
    log "Creating medical AI test suite..."
    
    cat > /home/resakse/Coding/reez/docs/ollama-medical-tests.py << 'EOF'
#!/usr/bin/env python3
"""
Medical AI Models Test Suite for Ollama
Tests medical models for RIS integration
"""

import requests
import json
import time
from datetime import datetime

OLLAMA_HOST = "http://localhost:11434"

def test_model_response(model_name, prompt, expected_keywords=None):
    """Test a model with a specific prompt and validate response"""
    
    print(f"\n=== Testing {model_name} ===")
    print(f"Prompt: {prompt[:80]}...")
    
    start_time = time.time()
    
    try:
        response = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": model_name,
                "prompt": prompt,
                "stream": False
            },
            timeout=60
        )
        
        response_time = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            answer = result.get('response', '')
            
            print(f"Response time: {response_time:.2f} seconds")
            print(f"Response length: {len(answer)} characters")
            
            if expected_keywords:
                found_keywords = [kw for kw in expected_keywords if kw.lower() in answer.lower()]
                print(f"Keywords found: {found_keywords}")
                
            print(f"Response preview: {answer[:200]}...")
            return True, answer
        else:
            print(f"ERROR: HTTP {response.status_code}")
            return False, None
            
    except Exception as e:
        print(f"ERROR: {e}")
        return False, None

def main():
    """Run comprehensive medical AI test suite"""
    
    print("Medical AI Models Test Suite")
    print("=" * 50)
    print(f"Testing at: {datetime.now()}")
    
    # Test cases for each medical model
    test_cases = [
        {
            "model": "medical-vision",
            "prompt": "What are the key anatomical landmarks to identify in a chest X-ray for proper patient positioning and image quality assessment?",
            "keywords": ["clavicle", "ribs", "diaphragm", "heart", "lungs"]
        },
        {
            "model": "medical-reports",
            "prompt": "Create a structured radiology report template for a brain MRI study including all standard sections.",
            "keywords": ["clinical history", "technique", "findings", "impression"]
        },
        {
            "model": "medical-qa",
            "prompt": "What quality assurance checks should be performed before finalizing a radiology report?",
            "keywords": ["accuracy", "completeness", "terminology", "critical findings"]
        }
    ]
    
    results = []
    
    for test_case in test_cases:
        success, response = test_model_response(
            test_case["model"],
            test_case["prompt"],
            test_case.get("keywords")
        )
        results.append({
            "model": test_case["model"],
            "success": success,
            "response_length": len(response) if response else 0
        })
    
    # Summary
    print("\n" + "=" * 50)
    print("TEST SUMMARY")
    print("=" * 50)
    
    for result in results:
        status = "PASS" if result["success"] else "FAIL"
        print(f"{result['model']}: {status} ({result['response_length']} chars)")
    
    successful_tests = sum(1 for r in results if r["success"])
    print(f"\nOverall: {successful_tests}/{len(results)} tests passed")
    
    if successful_tests == len(results):
        print("🎉 All medical AI models are working correctly!")
    else:
        print("⚠️  Some models need attention. Check the logs above.")

if __name__ == "__main__":
    main()
EOF

    chmod +x /home/resakse/Coding/reez/docs/ollama-medical-tests.py
    log "Created medical AI test suite at /home/resakse/Coding/reez/docs/ollama-medical-tests.py"
}

# Main execution
main() {
    echo "Starting Ollama Medical AI setup process..."
    echo "This script will:"
    echo "1. Verify Ollama and GPU availability"
    echo "2. Download medical AI models (~20GB total)"
    echo "3. Create optimized model configurations"
    echo "4. Test model functionality"
    echo "5. Create monitoring and test tools"
    echo ""
    
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
    
    # Create log file
    sudo touch "$LOG_FILE"
    sudo chmod 666 "$LOG_FILE"
    
    log "=== Starting Ollama Medical AI Setup ==="
    
    # Execute setup steps
    check_ollama
    check_gpu
    download_medical_models
    create_optimized_models
    test_models
    monitor_gpu_memory
    create_test_suite
    
    log "=== Setup Complete ==="
    echo ""
    echo -e "${GREEN}✅ Ollama Medical AI setup completed successfully!${NC}"
    echo ""
    echo "Available medical models:"
    ollama list | grep -E "(medical-|llava-med|meditron|medalpaca)"
    echo ""
    echo "Next steps:"
    echo "1. Run the test suite: python3 /home/resakse/Coding/reez/docs/ollama-medical-tests.py"
    echo "2. Check Django integration with your RIS backend"
    echo "3. Monitor GPU usage: nvidia-smi -l 1"
    echo "4. View logs: tail -f $LOG_FILE"
}

# Run main function
main "$@"