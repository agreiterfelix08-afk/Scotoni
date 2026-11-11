#!/bin/bash
# Stops the background bot and removes the automatic start.
PLIST="$HOME/Library/LaunchAgents/it.scotoni.emailbot.plist"
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "Automatic start removed. The bot is stopped."
