"""
All settings for the Rifugio Scotoni email bot live in this file.

You can change anything here with a normal text editor. After saving, stop the
bot and start it again so it picks up the new values.

Secrets (the Anthropic API key) are NOT stored here. They go in the `.env` file.
"""

# ---------------------------------------------------------------------------
# 1. The most important switch
# ---------------------------------------------------------------------------
# "draft" = the bot only writes Gmail DRAFTS. Nothing is sent. You read them in
#           Gmail (folder "Drafts") and press "Send" yourself if they're good.
# "send"  = the bot sends replies automatically.
#
# Keep this on "draft" for the first few weeks.
MODE = "draft"

# ---------------------------------------------------------------------------
# 2. Our own email address
# ---------------------------------------------------------------------------
# The bot never answers emails that come FROM this address (stops it from
# replying to itself in a loop).
OUR_ADDRESS = "info@scotoni.it"

# Any other addresses that belong to us (e.g. a personal address that forwards
# to info@). Emails from these are never answered either.
OTHER_OWN_ADDRESSES = []

# ---------------------------------------------------------------------------
# 3. How often to check the inbox
# ---------------------------------------------------------------------------
CHECK_INTERVAL_MINUTES = 5

# Only look at unread emails from the last N days. This stops the bot from
# working through a big pile of old unread emails the first time it runs.
ONLY_NEWER_THAN_DAYS = 2

# At most this many emails per check (a safety limit to keep costs predictable).
MAX_EMAILS_PER_RUN = 20

# ---------------------------------------------------------------------------
# 4. Claude (the AI) settings
# ---------------------------------------------------------------------------
MODEL = "claude-opus-5-5"

# How hard Claude thinks: "low", "medium", "high". "medium" is a good balance
# for reading short emails. Higher = slower and more expensive.
EFFORT = "medium"

# Emails longer than this (in characters) are not sent to Claude; they get the
# "Needs human" label instead. Very long emails are rarely "simple questions".
MAX_EMAIL_CHARACTERS = 15000

# ---------------------------------------------------------------------------
# 5. Gmail labels
# ---------------------------------------------------------------------------
# Colours must be from Gmail's fixed palette; these two are valid.
LABEL_NEEDS_HUMAN = "Needs human"
LABEL_NEEDS_HUMAN_COLOR = {"backgroundColor": "#cc3a21", "textColor": "#ffffff"}  # red

LABEL_BOT_REPLIED = "Bot replied"
LABEL_BOT_REPLIED_COLOR = {"backgroundColor": "#16a766", "textColor": "#ffffff"}  # green

# ---------------------------------------------------------------------------
# 6. Signatures (added automatically at the end of every reply)
# ---------------------------------------------------------------------------
SIGNATURES = {
    "it": "Cordiali saluti\nIl team del Rifugio Scotoni",
    "de": "Mit freundlichen Grüßen\nIhr Team vom Rifugio Scotoni",
    "en": "Kind regards\nThe Rifugio Scotoni team",
}

# ---------------------------------------------------------------------------
# 7. File names (normally you don't need to touch these)
# ---------------------------------------------------------------------------
KNOWLEDGE_BASE_FILE = "knowledge_base.md"
LOG_FILE = "bot_log.csv"
GOOGLE_CREDENTIALS_FILE = "credentials.json"  # downloaded from Google Cloud (secret!)
GOOGLE_TOKEN_FILE = "token.json"              # created on first login (secret!)
PROCESSED_FILE = "processed_ids.json"         # remembers which emails were already handled
