#!/bin/bash
# deploy_auditor.sh — Deploy the Skeptical Auditor to the n8n Droplet

# 1. Update and install Python dependencies
echo "Updating system and installing dependencies..."
sudo apt-get update
sudo apt-get install -y python3-pip python3-venv

# 2. Create directory and virtual environment
echo "Setting up auditor directory..."
mkdir -p /opt/auditor
cd /opt/auditor
python3 -m venv venv
source venv/bin/activate

# 3. Install Python packages
pip install fastapi uvicorn httpx pydantic

# 4. Copy auditor_service.py (Assuming it's uploaded to /tmp or current dir)
# If running via SSH, you might want to SCP it first.
# cp /tmp/auditor_service.py /opt/auditor/main.py

# 5. Create Systemd Service
echo "Creating systemd service..."
sudo bash -c 'cat <<EOF > /etc/systemd/system/auditor.service
[Unit]
Description=Skeptical Project Auditor Service
After=network.target

[Service]
User=root
WorkingDirectory=/opt/auditor
ExecStart=/opt/auditor/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF'

# 6. Start and Enable Service
sudo systemctl daemon-reload
sudo systemctl start auditor
sudo systemctl enable auditor

echo "Auditor deployed and running on port 8000."
