#!/bin/bash
# Double-click this file in Finder to start the bot in a Terminal window.
# Close the window (or press Ctrl+C) to stop it.
cd "$(dirname "$0")"
source .venv/bin/activate
python bot.py
