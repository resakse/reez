# Ollama Medical AI Setup Guide for RIS

This guide provides comprehensive instructions for setting up Ollama with medical AI models optimized for your NVIDIA P40 GPU server and radiology reporting system.

## Prerequisites

- Ubuntu/Linux server with NVIDIA P40 GPU (24GB VRAM)
- NVIDIA drivers installed
- Docker (optional, for containerized deployment)
- Minimum 32GB system RAM recommended
- At least 100GB free disk space for models

## 1. NVIDIA Driver and CUDA Setup

First, ensure your NVIDIA P40 has proper drivers and CUDA support:

```bash
# Check current GPU status
nvidia-smi

# Install NVIDIA drivers if not present
sudo apt update
sudo apt install nvidia-driver-535 nvidia-utils-535

# Install CUDA toolkit
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.0-1_all.deb
sudo dpkg -i cuda-keyring_1.0-1_all.deb
sudo apt-get update
sudo apt-get -y install cuda-toolkit-12-2

# Add CUDA to PATH
echo 'export PATH=/usr/local/cuda/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc

# Verify CUDA installation
nvcc --version
```

## 2. Ollama Installation

### Method 1: Official Installation Script (Recommended)

```bash
# Download and install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Verify installation
ollama --version
```

### Method 2: Manual Installation

```bash
# Download Ollama binary
curl -L https://ollama.com/download/ollama-linux-amd64 -o ollama
chmod +x ollama
sudo mv ollama /usr/local/bin/

# Create ollama user and service
sudo useradd -r -s /bin/false -m -d /usr/share/ollama ollama
```

## 3. GPU Configuration for NVIDIA P40

Create GPU-optimized configuration:

```bash
# Set GPU memory allocation (adjust based on your needs)
export OLLAMA_GPU_MEMORY_FRACTION=0.8  # Use 80% of 24GB = ~19GB
export OLLAMA_NUM_PARALLEL=2            # Parallel requests
export OLLAMA_MAX_LOADED_MODELS=3       # Keep 3 models in memory
export OLLAMA_FLASH_ATTENTION=1         # Enable flash attention for efficiency

# Add to system environment
sudo tee /etc/environment << EOF
OLLAMA_GPU_MEMORY_FRACTION=0.8
OLLAMA_NUM_PARALLEL=2
OLLAMA_MAX_LOADED_MODELS=3
OLLAMA_FLASH_ATTENTION=1
OLLAMA_HOST=0.0.0.0:11434
EOF
```

## 4. System Service Configuration

Create systemd service for auto-start:

```bash
# Create service file
sudo tee /etc/systemd/system/ollama.service << EOF
[Unit]
Description=Ollama Server
After=network-online.target

[Service]
ExecStart=/usr/local/bin/ollama serve
User=ollama
Group=ollama
Restart=always
RestartSec=3
Environment="PATH=/usr/local/cuda/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="LD_LIBRARY_PATH=/usr/local/cuda/lib64"
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_GPU_MEMORY_FRACTION=0.8"
Environment="OLLAMA_NUM_PARALLEL=2"
Environment="OLLAMA_MAX_LOADED_MODELS=3"
Environment="OLLAMA_FLASH_ATTENTION=1"

[Install]
WantedBy=default.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama

# Check service status
sudo systemctl status ollama
```

## 5. Medical AI Models Setup

Download and configure the required medical models:

```bash
# Start Ollama service if not already running
sudo systemctl start ollama

# Wait for service to be ready
sleep 10

# Download medical models (this will take significant time and bandwidth)
echo "Downloading medical AI models..."

# 1. Medical Vision-Language Model (for DICOM image analysis)
ollama pull llava-med:7b

# 2. Medical Knowledge LLM (for report generation)
ollama pull meditron:7b

# 3. Medical QA and Validation Model
ollama pull medalpaca:7b

# Verify models are downloaded
ollama list
```

## 6. Model Optimization for P40

Create custom model configurations optimized for medical workloads:

```bash
# Create custom modelfile for medical imaging
tee ~/medical-llava.modelfile << EOF
FROM llava-med:7b

# Medical imaging specific parameters
PARAMETER temperature 0.1          # Low temperature for consistent medical analysis
PARAMETER top_p 0.9               # Focused sampling
PARAMETER top_k 40                # Limited vocabulary for medical terms
PARAMETER repeat_penalty 1.1      # Avoid repetition in reports
PARAMETER num_ctx 4096            # Context window for long reports
PARAMETER num_gpu 1               # Use GPU acceleration

# Medical imaging system prompt
SYSTEM You are a specialized medical AI assistant trained in radiology and medical imaging analysis. You provide accurate, professional medical observations and recommendations based on DICOM images and clinical data. Always maintain medical accuracy and appropriate clinical language.
EOF

# Create optimized medical models
ollama create medical-llava -f ~/medical-llava.modelfile

# Similarly for meditron (medical reports)
tee ~/medical-meditron.modelfile << EOF
FROM meditron:7b

PARAMETER temperature 0.2
PARAMETER top_p 0.95
PARAMETER num_ctx 8192
PARAMETER num_gpu 1

SYSTEM You are a medical report generation AI specialized in radiology. Generate clear, structured, and clinically appropriate radiology reports based on imaging findings and patient data.
EOF

ollama create medical-meditron -f ~/medical-meditron.modelfile

# Medical QA model
tee ~/medical-alpaca.modelfile << EOF
FROM medalpaca:7b

PARAMETER temperature 0.1
PARAMETER top_p 0.9
PARAMETER num_ctx 4096
PARAMETER num_gpu 1

SYSTEM You are a medical quality assurance AI that validates radiology reports for accuracy, completeness, and clinical appropriateness. Provide constructive feedback and suggestions.
EOF

ollama create medical-alpaca -f ~/medical-alpaca.modelfile
```

## 7. Memory Management for P40 (24GB VRAM)

Configure memory allocation strategy:

```bash
# Create memory management script
tee ~/ollama-memory-monitor.sh << 'EOF'
#!/bin/bash

# Monitor GPU memory and unload models if needed
while true; do
    GPU_MEM_USED=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -n1)
    GPU_MEM_TOTAL=24576  # P40 has 24GB
    
    # If using more than 90% of GPU memory, unload least recently used model
    if [ $GPU_MEM_USED -gt $((GPU_MEM_TOTAL * 90 / 100)) ]; then
        echo "High GPU memory usage detected: ${GPU_MEM_USED}MB / ${GPU_MEM_TOTAL}MB"
        # Implement model unloading logic here if needed
    fi
    
    sleep 30
done
EOF

chmod +x ~/ollama-memory-monitor.sh
```

## 8. Verification and Testing

Test the Ollama installation and models:

```bash
# 1. Check Ollama service status
curl http://localhost:11434/api/version

# 2. Test model loading and inference
echo "Testing medical models..."

# Test medical vision model
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "medical-llava",
    "prompt": "Describe the key anatomical structures visible in a chest X-ray.",
    "stream": false
  }'

# Test medical report generation
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "medical-meditron",
    "prompt": "Generate a structured radiology report template for a chest CT scan.",
    "stream": false
  }'

# Test medical QA
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "medical-alpaca",
    "prompt": "What are the key quality indicators for a chest X-ray report?",
    "stream": false
  }'

# 3. Check GPU utilization
nvidia-smi

# 4. Monitor memory usage
ollama ps
```

## 9. Django Backend Integration Testing

Test connection with your Django RIS backend:

```bash
# Navigate to your Django project
cd /home/resakse/Coding/reez

# Test Django-Ollama connection (assuming you have a test script)
python manage.py shell << 'EOF'
import requests
import json

# Test Ollama connection from Django
try:
    response = requests.get('http://localhost:11434/api/version', timeout=10)
    print(f"Ollama version: {response.json()}")
    
    # Test model availability
    models_response = requests.get('http://localhost:11434/api/tags', timeout=10)
    models = models_response.json()
    print(f"Available models: {[model['name'] for model in models['models']]}")
    
    # Test simple inference
    test_prompt = {
        "model": "medical-meditron",
        "prompt": "What is a DICOM file?",
        "stream": False
    }
    
    inference_response = requests.post(
        'http://localhost:11434/api/generate',
        json=test_prompt,
        timeout=30
    )
    
    if inference_response.status_code == 200:
        result = inference_response.json()
        print(f"Test inference successful: {result['response'][:100]}...")
    else:
        print(f"Inference failed: {inference_response.status_code}")
        
except Exception as e:
    print(f"Connection test failed: {e}")
EOF
```

## 10. Performance Monitoring and Optimization

Create monitoring scripts for production use:

```bash
# Create performance monitoring script
tee ~/ollama-monitor.sh << 'EOF'
#!/bin/bash

LOG_FILE="/var/log/ollama-monitor.log"

while true; do
    echo "=== $(date) ===" >> $LOG_FILE
    
    # GPU stats
    nvidia-smi --query-gpu=timestamp,name,temperature.gpu,memory.used,memory.total,utilization.gpu --format=csv >> $LOG_FILE
    
    # Ollama stats
    curl -s http://localhost:11434/api/ps | jq '.' >> $LOG_FILE 2>/dev/null
    
    # System memory
    free -h >> $LOG_FILE
    
    echo "" >> $LOG_FILE
    sleep 60
done
EOF

chmod +x ~/ollama-monitor.sh
```

## 11. Production Deployment Checklist

- [ ] NVIDIA drivers and CUDA installed
- [ ] Ollama service running and enabled
- [ ] All medical models downloaded and optimized
- [ ] GPU memory allocation configured (80% of 24GB)
- [ ] System service auto-starts on boot
- [ ] Monitoring scripts in place
- [ ] Django backend can connect to Ollama
- [ ] Performance benchmarks established
- [ ] Backup and recovery procedures documented

## 12. Troubleshooting

### Common Issues:

**Ollama service won't start:**
```bash
sudo journalctl -u ollama -f
# Check GPU availability
nvidia-smi
```

**Out of GPU memory:**
```bash
# Reduce memory allocation
export OLLAMA_GPU_MEMORY_FRACTION=0.6
sudo systemctl restart ollama
```

**Model loading failures:**
```bash
# Check disk space
df -h
# Re-download corrupted model
ollama rm model_name
ollama pull model_name
```

**Poor inference performance:**
```bash
# Check GPU utilization
nvidia-smi -l 1
# Adjust parallel processing
export OLLAMA_NUM_PARALLEL=1
```

## 13. Security Considerations

For production deployment:

```bash
# Restrict Ollama to localhost only (if Django backend is on same server)
export OLLAMA_HOST=127.0.0.1:11434

# Or configure firewall for specific access
sudo ufw allow from 192.168.1.0/24 to any port 11434
```

## 14. Maintenance and Updates

```bash
# Update Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Update models periodically
ollama pull llava-med:7b
ollama pull meditron:7b
ollama pull medalpaca:7b

# Clean up old model versions
ollama list
ollama rm old_model_version
```

This setup provides a robust, GPU-accelerated Ollama deployment optimized for medical AI workloads on your NVIDIA P40 server. The configuration ensures efficient memory usage, automatic service management, and seamless integration with your Django RIS backend.