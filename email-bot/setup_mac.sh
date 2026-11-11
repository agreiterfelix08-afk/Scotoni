#!/bin/bash
# One-time setup on your Mac. Run it in Terminal from inside this folder:
#     ./setup_mac.sh
# It installs what the bot needs and creates the secret .env file for you.
set -e
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python is not installed. Download it from https://www.python.org/downloads/ and run this again."
  exit 1
fi

echo "1/3  Creating the private Python box (.venv) ..."
python3 -m venv .venv
source .venv/bin/activate

echo "2/3  Installing the bot's libraries (takes a minute) ..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo "3/3  Creating the secret .env file"
if [ -f .env ]; then
  echo "     .env already exists, leaving it as it is."
else
  read -r -p "     Gmail address the bot should use (your personal Gmail for testing): " BOT_EMAIL
  read -r -s -p "     Claude API key (starts with sk-ant-, it stays hidden while you paste): " API_KEY
  echo
  printf 'ANTHROPIC_API_KEY=%s\nBOT_EMAIL=%s\n' "$API_KEY" "$BOT_EMAIL" > .env
  chmod 600 .env
  echo "     Saved."
fi

chmod +x ./*.sh ./*.command
echo
echo "Setup finished. Next: put credentials.json in this folder (TEST.md, part B), then run:"
echo "    source .venv/bin/activate"
echo "    python bot.py --once"
