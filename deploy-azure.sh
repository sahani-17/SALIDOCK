#!/bin/bash
# ==============================================================================
# SaliDock — Automated Azure VM Setup & Deployment Script
# ==============================================================================
set -e

echo "🚀 Starting SaliDock Azure VM Setup..."

# 1. Update system packages
echo "📦 Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git ca-certificates gnupg lsb-release

# 2. Install Docker & Docker Compose if not installed
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker Engine..."
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo usermod -aG docker $USER
    echo "✅ Docker installed successfully."
else
    echo "✅ Docker is already installed."
fi

# 3. Pull PUResNet base CPU image for 3-method consensus
echo "🧬 Pulling PUResNet CPU image for cavity detection consensus..."
sudo docker pull jivankandel/puresnet:latest || true
if [ -f "backend/puresnet_cpu.Dockerfile" ]; then
    echo "🔨 Building salidock-puresnet-cpu:latest image..."
    sudo docker build -f backend/puresnet_cpu.Dockerfile -t salidock-puresnet-cpu:latest .
fi

# 4. Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found! Copying .env.example..."
    cp .env.example .env
    echo "👉 Please edit .env with your real SUPABASE_URL and SUPABASE_KEY before running docker compose."
fi

# 5. Launch SaliDock via Docker Compose
echo "🚀 Building and starting SaliDock containers..."
sudo docker compose up -d --build

echo "=============================================================================="
echo "🎉 SaliDock deployment process triggered!"
echo "📍 Access your deployment at: http://$(curl -s ifconfig.me)"
echo "=============================================================================="
