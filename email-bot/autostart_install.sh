#!/bin/bash
# Makes the bot start automatically every time you log in to your Mac,
# and restarts it if it ever crashes. Run once:   ./autostart_install.sh
# To turn it off again:                         ./autostart_uninstall.sh
set -e
cd "$(dirname "$0")"
FOLDER="$(pwd)"
PLIST="$HOME/Library/LaunchAgents/it.scotoni.emailbot.plist"

if [ ! -x "$FOLDER/.venv/bin/python" ]; then
  echo "Please do the installation first (README step 1): .venv not found."
  exit 1
fi
if [ ! -f "$FOLDER/token.json" ]; then
  echo "Please run 'python bot.py --once' one time first, so you can log in to Gmail."
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>it.scotoni.emailbot</string>
  <key>ProgramArguments</key>
  <array>
    <string>$FOLDER/.venv/bin/python</string>
    <string>$FOLDER/bot.py</string>
  </array>
  <key>WorkingDirectory</key>  <string>$FOLDER</string>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>ThrottleInterval</key>  <integer>60</integer>
  <key>StandardOutPath</key>   <string>$FOLDER/bot_output.log</string>
  <key>StandardErrorPath</key> <string>$FOLDER/bot_errors.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Done. The bot now runs in the background and starts at every login."
echo "Its messages are written to bot_output.log and bot_errors.log in this folder."
