# Rifugio Scotoni email bot

A small program that runs on your Mac, checks **info@scotoni.it** every 5 minutes and:

| Email type | What the bot does |
|---|---|
| Simple question that the knowledge base fully answers (hours, seasons, how to get there, food/allergies/gluten, dogs, payment, contact, room availability) | Writes a short, formal reply in the guest's language. In `draft` mode it is only a **Gmail draft** that you check and send yourself. The email gets a green **"Bot replied"** label and is marked read. |
| Everything else (reservations, jobs, lost items, press, complaints, groups, anything unclear) | **No reply.** Red **"Needs human"** label, the email stays unread. |
| Newsletters, spam, automatic notifications, no-reply senders | Nothing. |

Every action is written as one line in `bot_log.csv` (you can open it with Numbers or Excel).

## What's in this folder

| File | What it is | Do you edit it? |
|---|---|---|
| `knowledge_base.md` | The only facts the bot may use | **Yes**, whenever something changes |
| `config.py` | All settings, including `MODE = "draft"` / `"send"` | Sometimes |
| `bot.py` | The main program | No |
| `classifier.py` | Talks to Claude: the rules for deciding and writing replies | Only to change the rules |
| `gmail_client.py` | Talks to Gmail | No |
| `test_bot.py` | Tries the bot on 15 fake emails, without touching Gmail | No |
| `test_safety_rules.py` | Free checks of the safety rules (no Claude, no Gmail) | No |
| `check_email_setup.py` | Step 0: finds out if scotoni.it uses Gmail | No |
| `start_bot.command` | Double-click to start the bot | No |
| `autostart_install.sh` / `autostart_uninstall.sh` | Turn automatic start on/off | No |
| `.env`, `credentials.json`, `token.json` | **Secrets.** Created by you during setup. Never share them, never upload them. `.gitignore` keeps them out of GitHub. | No |

---

## Step-by-step setup (on your Mac)

You will type commands in the **Terminal** app. To open it: press `⌘ Cmd` + `Space`, type `Terminal`, press Enter.
In this guide, a grey box is a command. Copy it, paste it into Terminal, press Enter.

### Step 1: Put the folder on your Mac and install Python

1. Get the code. Easiest way: on GitHub open the repository, switch to the branch
   `claude/rifugio-scotoni-email-bot-6phxtt` (or `main` once it's merged), click the green **Code** button,
   then **Download ZIP**. Unzip it.
2. Move the `email-bot` folder into your **home folder** (the one with the house icon in Finder) and rename it
   `scotoni-email-bot`.
   *Why not Desktop or Documents? macOS stops background programs from reading those two folders, so the
   automatic start (step 8) would fail there.*
3. Check if Python is installed:
   ```
   python3 --version
   ```
   If you see `Python 3.10` or higher, good. Otherwise download it from https://www.python.org/downloads/
   (the big yellow button), open the downloaded file and click through the installer. Close and reopen Terminal.
4. Go into the folder and install what the bot needs:
   ```
   cd ~/scotoni-email-bot
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   chmod +x *.sh *.command
   ```
   `venv` creates a private Python box just for this bot (the `.venv` folder), so it doesn't mess with anything else.
   **Every time** you open a new Terminal to work with the bot, first run:
   ```
   cd ~/scotoni-email-bot
   source .venv/bin/activate
   ```
   (You'll see `(.venv)` at the start of the line.)

### Step 2: Check that scotoni.it really uses Gmail

```
python check_email_setup.py
```

* **"RESULT: Google Workspace (Gmail)"** → continue with step 3.
* **"RESULT: NOT Gmail"** → stop here. Send the output to Claude Code and ask for the IMAP/SMTP version.
  (It works the same, but uses an IMAP folder/flag instead of coloured labels.)

You can also check by hand: in Terminal type `dig MX scotoni.it +short`. If the lines end in `google.com`
(e.g. `aspmx.l.google.com`), it's Gmail.

### Step 3: Get an Anthropic (Claude) API key

1. Go to https://console.anthropic.com and sign up / log in.
2. **Settings → Billing**: add a payment method and some credit (e.g. 10 €).
3. **Settings → API Keys → Create Key**. Name it `scotoni-email-bot`. Copy the key (starts with `sk-ant-`).
   You can only see it once.
4. In Terminal (in the bot folder):
   ```
   cp .env.example .env
   open -e .env
   ```
   TextEdit opens. Replace `sk-ant-put-your-key-here` with your key, save (`⌘ S`), close.

Cost: roughly 1–3 cents per email that Claude reads. Newsletters and no-reply senders are filtered out before
Claude, so they cost nothing.

### Step 4: Test with fake emails (before connecting Gmail)

```
python test_safety_rules.py
python test_bot.py
```

The first command checks the safety rules (free, should say `OK`).
The second sends 15 made-up emails (Italian, German, English) to Claude and shows, for each one, the category,
the reason and the reply that *would* be drafted. Nothing touches Gmail. Read the replies carefully: is the
tone right? Are the facts right? If something is wrong, it usually means `knowledge_base.md` needs a clearer
sentence. Change it and run `python test_bot.py` again.

### Step 5: Allow the bot to use Gmail (Google Cloud Console)

Do this logged in as **info@scotoni.it** (or as the Google Workspace admin).

1. Go to https://console.cloud.google.com
2. At the top, click the project picker (next to "Google Cloud") → **New project**. Name: `scotoni-email-bot`
   → **Create**. Wait a few seconds, then select this project in the project picker.
3. In the search bar at the top type **Gmail API**, click it, click **Enable**.
4. Left menu (☰) → **APIs & Services → OAuth consent screen** (it may be called **Google Auth Platform**)
   → **Get started**.
   * App name: `Scotoni email bot` · User support email: `info@scotoni.it` → **Next**
   * Audience: choose **Internal** → **Next**.
     *Internal means only people of scotoni.it can use it, and the login doesn't expire. If "Internal" is
     greyed out, choose External, then under **Audience → Test users** add `info@scotoni.it`. In that case
     Google makes the login expire every 7 days: delete `token.json` and log in again when it stops working.*
   * Contact email: yours → **Next** → tick the agreement → **Create**.
5. Left menu → **Clients** (or **Credentials → Create credentials → OAuth client ID**) → **Create client**.
   * Application type: **Desktop app** · Name: `scotoni-bot-mac` → **Create**.
   * Click **Download JSON**. Rename the downloaded file to exactly `credentials.json` and move it into
     `~/scotoni-email-bot`.

### Step 6: First real run, in draft mode

Check that `config.py` says `MODE = "draft"`. Then:

```
python bot.py --once
```

* The first time, your browser opens. Log in with **info@scotoni.it**, click **Continue/Allow**.
  (If Google warns "Google hasn't verified this app": that's normal for your own app, click
  **Continue**.) A file `token.json` is created, so you won't be asked again.
* The bot creates the two labels, looks at unread emails from the last 2 days, and stops.
* Look in Gmail: **Drafts** for the replies, the red **Needs human** label, and open `bot_log.csv`.

`--once` = check one time and stop. Good for testing.

### Step 7: Run it continuously

Double-click `start_bot.command` in Finder (the first time, macOS may ask: right-click → **Open** → **Open**).
A Terminal window shows what the bot is doing. Leave it open. Close it to stop the bot.

Or in Terminal: `python bot.py` (stop with `Ctrl` + `C`).

### Step 8: Start automatically when the Mac turns on

After step 6 worked once:

```
./autostart_install.sh
```

From now on the bot runs in the background whenever you're logged in to your Mac (no window). It also restarts
by itself if it crashes. Its screen output goes to `bot_output.log` and errors to `bot_errors.log`.

* Stop and remove the automatic start: `./autostart_uninstall.sh`
* After changing `config.py` or `knowledge_base.md`: run `./autostart_install.sh` again (it restarts the bot).
* The bot only works while the Mac is on and awake. To keep it awake: **System Settings → Energy** (or
  **Battery → Options**) → turn on **Prevent automatic sleeping when the display is off**.

### Step 9 (in a few weeks): switch to automatic sending

Only once the drafts have been consistently good: open `config.py`, change `MODE = "draft"` to
`MODE = "send"`, save, and restart the bot (`./autostart_install.sh`). You can switch back any time.

---

## Daily use

* Gmail → label **Needs human**: emails you need to handle. Remove the label when done (or leave it, either is fine).
* Gmail → **Drafts**: check the bot's replies, edit if needed, press **Send**. Delete bad ones.
* Gmail → label **Bot replied**: everything the bot answered.
* `bot_log.csv`: what happened and why, one line per email.

## Safety rules built in

* Never replies to emails from `info@scotoni.it` (or other addresses in `OTHER_OWN_ADDRESSES` in `config.py`).
* Never replies in a conversation where we already sent something, already have a draft, or the bot already
  replied. Such emails get "Needs human".
* Uses only facts from `knowledge_base.md`. If an email needs anything else, or mixes a simple question with a
  reservation/complaint/etc., or Claude is not sure, there's no reply and the email gets "Needs human".
* Extra checks in code: no reply if Claude wasn't confident, if the reply is empty, or if it contains something
  that looks like a phone number.
* Emails are treated as data, not instructions: "ignore your rules and…" in an email doesn't work.
* Only unread emails from the last 2 days, max 20 per check.

## Problems?

| Message | What to do |
|---|---|
| `No ANTHROPIC_API_KEY found` | The `.env` file is missing or the key is wrong (step 3). |
| `Missing credentials.json` | Step 5.5: the file must be in the folder and be named exactly `credentials.json`. |
| `invalid_grant` / `Token has been expired or revoked` | Delete `token.json` and run `python bot.py --once` to log in again. |
| `access_denied` / "admin has blocked this app" | In Google Workspace admin (admin.google.com) → Security → API controls, allow the app. Or use "Internal" in step 5.4. |
| `credit balance is too low` | Add credit in the Anthropic console (step 3). |
| Nothing happens | Look in `bot_errors.log`, and check that the Mac is awake and online. |
