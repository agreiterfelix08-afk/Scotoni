# Test version: try the bot on your personal Gmail

This is a safe trial run on your own Google account before connecting info@scotoni.it.

**What the test version does:**
- It **only** looks at emails that have the word **TESTBOT** in the subject. All your other emails stay untouched:
  no labels, no drafts, nothing read.
- It only writes **drafts** (`MODE = "draft"` in `config.py`). Nothing is ever sent.
- Everything else works exactly like the real version: classification, labels "Needs human" and "Bot replied",
  the reply in the guest's language, and `bot_log.csv`.

Takes about 30 minutes the first time. You need: your Mac, your personal Gmail, and a second email address
to send test emails from (see part D).

---

## A. Install (10 minutes)

1. Download the code: on GitHub, open the repository, switch to branch `claude/rifugio-scotoni-email-bot-6phxtt`,
   click the green **Code** button → **Download ZIP**. Double-click the ZIP to unzip it.
2. Inside the unzipped folder, find the `email-bot` folder. Move it into your **home folder** (Finder → menu
   **Go → Home**) and rename it `scotoni-email-bot`.
3. Get a Claude API key: https://console.anthropic.com → sign up → **Settings → Billing**: add 5–10 € of credit →
   **Settings → API Keys → Create Key** → copy it.
4. Open **Terminal** (`Cmd` + `Space`, type `Terminal`, Enter) and paste these two lines (Enter after each):
   ```
   cd ~/scotoni-email-bot
   bash setup_mac.sh
   ```
   It asks for your **Gmail address** and your **API key** (the key stays invisible while you paste it; that's
   normal, just press Enter). If it says Python is missing, install it from https://www.python.org/downloads/ and run
   the second line again.
5. Try the fake emails first (no Gmail needed, costs a few cents):
   ```
   source .venv/bin/activate
   python test_bot.py
   ```
   You see 15 made-up emails, what the bot decided, and the reply it would write.

## B. Allow the bot to read your Gmail (15 minutes)

Log in to Google with your **personal Gmail** for all of this.

1. Open https://console.cloud.google.com (accept the terms if asked).
2. At the top, click **Select a project** → **New project**. Name: `scotoni-bot-test` → **Create**.
   Then click **Select a project** again and choose `scotoni-bot-test`.
3. In the search bar at the top type `Gmail API` → click **Gmail API** → **Enable**.
4. In the search bar type `OAuth consent screen` and open it (the page may be titled **Google Auth Platform**)
   → **Get started**:
   - App name: `Scotoni bot test` · User support email: your Gmail → **Next**
   - Audience: **External** → **Next**
   - Contact information: your Gmail → **Next** → tick "I agree" → **Continue** → **Create**
5. Left menu → **Audience** → under **Test users** click **Add users** → type your Gmail address → **Save**.
   (Only test users may log in to an app that isn't published. That's what we want.)
6. Left menu → **Clients** → **Create client**:
   - Application type: **Desktop app** · Name: `mac` → **Create**
   - In the window that appears click **Download JSON**.
7. In Finder, open **Downloads**, rename that file (`client_secret_....json`) to exactly **`credentials.json`**
   and move it into `scotoni-email-bot`.

## C. First run (2 minutes)

In Terminal (in the bot folder, with `(.venv)` at the start of the line):
```
python bot.py --once
```
- Your browser opens. Choose your Gmail account.
- Google shows **"Google hasn't verified this app"**. That's normal for an app you made yourself: click
  **Continue**. Then tick the box to allow access to Gmail, then **Continue**.
- The browser says the flow is complete; go back to Terminal. The bot creates the labels and stops.
  You'll now see **Needs human** (red) and **Bot replied** (green) in Gmail's left sidebar.

## D. Send yourself test emails

Send emails **to your personal Gmail** from **another address** (a second account, a work address, a friend).
Emails sent from your own address are ignored on purpose (that's the loop protection).

Put **TESTBOT** anywhere in the subject. Pretend to be a guest. Ideas:

| Subject | Text | Expected |
|---|---|---|
| `TESTBOT Hund` | Dürfen wir unseren Hund mitbringen? | German draft: dogs welcome |
| `TESTBOT orari` | A che ora chiude la cucina? | Italian draft: 11:30–16:00 |
| `TESTBOT gluten` | Do you have gluten free food? My son is coeliac. | English draft with the cross-contamination note |
| `TESTBOT Tisch` | Ich möchte für Samstag einen Tisch für 4 reservieren. | No reply, red "Needs human" |
| `TESTBOT lavoro` | Vorrei candidarmi come cameriere. | No reply, red "Needs human" |
| `TESTBOT dogs and booking` | Are dogs allowed? Also please cancel my room for 3 July. | No reply, "Needs human" (mixed) |

Then run `python bot.py --once` again, or keep it running with `python bot.py` (checks every 5 minutes; stop with
`Ctrl` + `C`). Check:
- **Drafts** in Gmail: the replies sit in the same conversation as the test email.
- The labels on the test emails.
- `bot_log.csv` in the folder (open with Numbers or Excel): one line per email with the reason.

Reply to a test email once the bot has drafted something, from the other address, with TESTBOT still in the
subject: the bot must **not** draft a second reply in that conversation.

## Good to know

- **After 7 days** Google ends the login for test apps. If the bot then shows `invalid_grant` or
  `Token has been expired or revoked`: delete `token.json` in the folder and run `python bot.py --once` again.
- Wrong or missing facts in a reply → improve `knowledge_base.md`, then test again.
- To clean up after testing: delete the drafts and test emails; delete the two labels in Gmail (hover over the
  label in the sidebar → ⋮ → **Remove label**).

## Moving to info@scotoni.it later

1. In `.env`, change `BOT_EMAIL=` to `info@scotoni.it`.
2. In `config.py`, set `TEST_MODE = False`.
3. Delete `token.json` and `credentials.json`, then follow README step 5 with the info@scotoni.it account (there you
   can choose **Internal**, so the login doesn't expire).
4. Delete `processed_ids.json` and run `python bot.py --once`.
