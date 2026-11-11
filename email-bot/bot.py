"""
Rifugio Scotoni email bot: the main program.

Start it with:
    python bot.py          # keeps running, checks every few minutes
    python bot.py --once   # checks the inbox one time and stops (good for testing)

What it does for each new unread email:
    1. Simple checks (our own address, no-reply, newsletter)  -> ignore
    2. Someone from our side already answered in this thread  -> "Needs human"
    3. Claude decides: ANSWER / NEEDS_HUMAN / IGNORE
         ANSWER      -> draft (or send) a reply, mark read, label "Bot replied"
         NEEDS_HUMAN -> red label "Needs human", stays unread
         IGNORE      -> nothing (only remembered so it isn't checked again)
    4. One line per email is written to bot_log.csv
"""

import csv
import json
import re
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")  # loads ANTHROPIC_API_KEY before anything else

import classifier  # noqa: E402
import config  # noqa: E402
import gmail_client  # noqa: E402

LOG_COLUMNS = ["time", "mode", "sender", "subject", "category", "topic", "language", "action", "reason", "gmail_id"]


def log(email: dict, category: str, action: str, reason: str, topic: str = "", language: str = ""):
    """Append one line to bot_log.csv (and print it on screen)."""
    path = HERE / config.LOG_FILE
    new_file = not path.exists()
    row = {
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "mode": config.MODE,
        "sender": email.get("from_address", ""),
        "subject": email.get("subject", ""),
        "category": category,
        "topic": topic,
        "language": language,
        "action": action,
        "reason": reason,
        "gmail_id": email.get("id", ""),
    }
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=LOG_COLUMNS)
        if new_file:
            writer.writeheader()
        writer.writerow(row)
    print(f"[{row['time']}] {category:<11} {action:<22} {row['sender']}  |  {row['subject'][:60]}")


# --- Remembering which emails we already looked at -------------------------
def load_processed() -> set[str]:
    path = HERE / config.PROCESSED_FILE
    return set(json.loads(path.read_text())) if path.exists() else set()


def save_processed(ids: set[str]):
    # keep only the most recent 5000 so the file stays small
    (HERE / config.PROCESSED_FILE).write_text(json.dumps(sorted(ids)[-5000:]))


# --- One email --------------------------------------------------------------
def is_test_email(email: dict) -> bool:
    return config.TEST_SUBJECT_WORD.lower() in email.get("subject", "").lower()


def without_test_word(email: dict) -> dict:
    """A copy of the email with the test word removed from the subject, so
    Claude reads the email exactly as a real guest would have written it."""
    cleaned = re.sub(re.escape(config.TEST_SUBJECT_WORD), "", email.get("subject", ""), flags=re.I)
    return {**email, "subject": " ".join(cleaned.split())}


def handle_email(service, email: dict, labels: dict):
    own = classifier.own_addresses()

    # Test version: never touch anything without the test word in the subject
    if config.TEST_MODE:
        if not is_test_email(email):
            log(email, "SKIPPED", "nothing", "Test mode: no test word in the subject.")
            return

    # Quick free checks first (no Claude call)
    shortcut = classifier.pre_filter(email)
    if shortcut and shortcut[0] == classifier.IGNORE:
        log(email, "IGNORE", "nothing", shortcut[1])
        return

    # Never reply twice in the same conversation
    if gmail_client.thread_already_handled(service, email["thread_id"], own, labels["replied"]):
        gmail_client.add_labels(service, email["id"], [labels["human"]], mark_read=False)
        log(email, "NEEDS_HUMAN", "labelled Needs human", "We already replied or drafted in this thread.")
        return

    # Claude reads the email without the test word (the reply keeps the
    # original subject so Gmail puts it in the same conversation).
    decision, _ = classifier.classify(without_test_word(email) if config.TEST_MODE else email)

    if decision.category == classifier.IGNORE:
        log(email, "IGNORE", "nothing", decision.reason, decision.topic, decision.language)

    elif decision.category == classifier.NEEDS_HUMAN:
        gmail_client.add_labels(service, email["id"], [labels["human"]], mark_read=False)
        log(email, "NEEDS_HUMAN", "labelled Needs human", decision.reason, decision.topic, decision.language)

    elif decision.category == classifier.ANSWER:
        text = classifier.full_reply(decision)
        if config.MODE == "send":
            gmail_client.send_reply(service, email, text)
            action = "reply SENT"
        else:
            gmail_client.create_draft(service, email, text)
            action = "draft created"
        gmail_client.add_labels(service, email["id"], [labels["replied"]], mark_read=True)
        log(email, "ANSWER", action, decision.reason, decision.topic, decision.language)


# --- One check of the inbox --------------------------------------------------
def run_once(service, labels: dict):
    processed = load_processed()
    for message_id in gmail_client.list_new_message_ids(service):
        if message_id in processed:
            continue
        email = {"id": message_id}
        try:
            email = gmail_client.get_email(service, message_id)
            handle_email(service, email, labels)
            processed.add(message_id)
        except Exception as error:  # one broken email must not stop the bot
            # Not marked as processed, so it will be tried again next time.
            log(email, "ERROR", "will retry", f"{type(error).__name__}: {error}")
            traceback.print_exc()
        save_processed(processed)


def main():
    if config.MODE not in ("draft", "send"):
        raise SystemExit('MODE in config.py must be "draft" or "send".')

    print(f"Rifugio Scotoni email bot starting. MODE = {config.MODE!r}, account = {config.OUR_ADDRESS}")
    if config.TEST_MODE:
        print(f"TEST MODE: only emails with '{config.TEST_SUBJECT_WORD}' in the subject are handled.")
    service = gmail_client.connect()
    labels = {
        "human": gmail_client.get_or_create_label(service, config.LABEL_NEEDS_HUMAN, config.LABEL_NEEDS_HUMAN_COLOR),
        "replied": gmail_client.get_or_create_label(service, config.LABEL_BOT_REPLIED, config.LABEL_BOT_REPLIED_COLOR),
    }

    if "--once" in sys.argv:
        run_once(service, labels)
        return

    while True:
        try:
            run_once(service, labels)
        except Exception:
            # e.g. no internet for a moment: wait and try again
            traceback.print_exc()
        time.sleep(config.CHECK_INTERVAL_MINUTES * 60)


if __name__ == "__main__":
    main()
