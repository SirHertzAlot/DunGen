#!/bin/bash

# Log file for errors
LOG_FILE="/workspaces/DunGen/logs/service-monitor.log"

# Function to log messages
log_message() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Check if redis-server is running
if ! pgrep -x "redis-server" > /dev/null; then
  log_message "WARNING: redis-server is not running. Attempting to start..."
  if ! sudo systemctl start redis-server; then
    log_message "ERROR: Failed to start redis-server. Please check the Redis configuration."
    exit 1
  else
    log_message "SUCCESS: redis-server started successfully."
  fi
fi

# Check if npm run dev server is running
if ! pgrep -f "npm run dev" > /dev/null; then
  log_message "WARNING: npm run dev server is not running. Attempting to start..."
  if ! (cd /workspaces/DunGen && npm run dev &); then
    log_message "ERROR: Failed to start npm run dev server. Please check the application logs."
    exit 1
  else
    log_message "SUCCESS: npm run dev server started successfully."
  fi
fi

log_message "All services are running."
