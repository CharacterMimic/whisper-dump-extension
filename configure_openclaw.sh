#!/bin/bash
# configure_openclaw.sh — Configure Hooks and CLI for OpenClaw/AdClaw

# 1. Update Environment Variables for Hooks
# Replace these with your actual n8n webhook URLs
N8N_AUDIT_HOOK="http://137.184.235.85:5678/webhook/audit-log"
N8N_EARNING_HOOK="http://137.184.235.85:5678/webhook/earning-swarm"

echo "Configuring /opt/openclaw.env..."
sudo bash -c "cat <<EOF >> /opt/openclaw.env
# Custom Hooks for Earning Swarm
AUDITOR_SERVICE_URL=http://137.184.235.85:8000
N8N_AUDIT_HOOK=$N8N_AUDIT_HOOK
N8N_EARNING_HOOK=$N8N_EARNING_HOOK
EARNING_SWARM_MODE=enabled
EOF"

# 2. Restart OpenClaw to apply changes
echo "Restarting OpenClaw..."
sudo systemctl restart openclaw

# 3. CLI Channel Configuration Example
echo "Adding Telegram Channel via CLI..."
# Note: This requires interactive input usually, but we can provide the command
# sudo /opt/openclaw-cli.sh channels add --type telegram

echo "Configuration complete. Environment hooks active."
