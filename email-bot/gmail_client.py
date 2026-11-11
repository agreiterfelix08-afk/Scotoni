"""
Everything that talks to Gmail lives in this file.

The first time it runs, a browser window opens and asks you to log in with
info@scotoni.it and allow access. After that, the permission is saved in
`token.json` (a secret file: never share it) and no login is needed.
"""

import base64
import html
import re
from email.mime.text import MIMEText
from email.utils import parseaddr
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

import config

# "gmail.modify" lets the bot read emails, add labels, mark as read, create
# drafts and send. It can NOT permanently delete emails.
SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]

HERE = Path(__file__).parent


def connect():
    """Log in to Gmail and return a 'service' object used for all other calls."""
    token_path = HERE / config.GOOGLE_TOKEN_FILE
    credentials_path = HERE / config.GOOGLE_CREDENTIALS_FILE
    creds = None

    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())  # renew silently
        else:
            if not credentials_path.exists():
                raise SystemExit(
                    f"Missing {config.GOOGLE_CREDENTIALS_FILE}. "
                    "Download it from Google Cloud Console (see README, step 5)."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path), SCOPES)
            creds = flow.run_local_server(port=0)  # opens your browser
        token_path.write_text(creds.to_json())

    return build("gmail", "v1", credentials=creds, cache_discovery=False)


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------
def get_or_create_label(service, name: str, color: dict) -> str:
    """Return the ID of the label with this name, creating it (with colour) if needed."""
    labels = service.users().labels().list(userId="me").execute().get("labels", [])
    for label in labels:
        if label["name"].lower() == name.lower():
            return label["id"]
    body = {
        "name": name,
        "labelListVisibility": "labelShow",
        "messageListVisibility": "show",
        "color": color,
    }
    return service.users().labels().create(userId="me", body=body).execute()["id"]


def add_labels(service, message_id: str, add: list[str], mark_read: bool):
    body = {"addLabelIds": add, "removeLabelIds": ["UNREAD"] if mark_read else []}
    service.users().messages().modify(userId="me", id=message_id, body=body).execute()


# ---------------------------------------------------------------------------
# Reading emails
# ---------------------------------------------------------------------------
def list_new_message_ids(service) -> list[str]:
    """Unread emails in the inbox from the last few days that the bot hasn't labelled yet."""
    query = (
        f"in:inbox is:unread newer_than:{config.ONLY_NEWER_THAN_DAYS}d "
        f'-label:"{config.LABEL_NEEDS_HUMAN}" -label:"{config.LABEL_BOT_REPLIED}"'
    )
    result = service.users().messages().list(
        userId="me", q=query, maxResults=config.MAX_EMAILS_PER_RUN
    ).execute()
    # Gmail returns newest first; we handle oldest first.
    return [m["id"] for m in reversed(result.get("messages", []))]


def _decode(data: str) -> str:
    return base64.urlsafe_b64decode(data.encode()).decode("utf-8", errors="replace")


def _html_to_text(raw_html: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", raw_html)
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n\n", text)).strip()


def _find_body(payload: dict) -> str:
    """Find the plain-text body (or turn the HTML body into text)."""
    plain, html_part = [], []

    def walk(part):
        mime = part.get("mimeType", "")
        data = part.get("body", {}).get("data")
        if data and mime == "text/plain":
            plain.append(_decode(data))
        elif data and mime == "text/html":
            html_part.append(_decode(data))
        for sub in part.get("parts", []) or []:
            walk(sub)

    walk(payload)
    if plain:
        return "\n".join(plain).strip()
    if html_part:
        return _html_to_text("\n".join(html_part))
    return ""


def get_email(service, message_id: str) -> dict:
    """Download one email and return the parts we need as a simple dict."""
    msg = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    headers = {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}
    from_name, from_address = parseaddr(headers.get("from", ""))
    _, reply_to = parseaddr(headers.get("reply-to", ""))
    return {
        "id": msg["id"],
        "thread_id": msg["threadId"],
        "label_ids": msg.get("labelIds", []),
        "headers": headers,
        "from_name": from_name,
        "from_address": from_address,
        "reply_to": reply_to or from_address,
        "subject": headers.get("subject", ""),
        "message_id_header": headers.get("message-id", ""),
        "references": headers.get("references", ""),
        "body": _find_body(msg["payload"]),
    }


def thread_already_handled(service, thread_id: str, own_addresses: set[str], bot_label_id: str) -> bool:
    """
    True if anyone from our side already wrote in this thread (a sent email,
    a draft, or an email the bot labelled "Bot replied"). Then the bot must
    not reply again.
    """
    thread = service.users().threads().get(userId="me", id=thread_id, format="metadata",
                                           metadataHeaders=["From"]).execute()
    for message in thread.get("messages", []):
        labels = set(message.get("labelIds", []))
        if labels & {"SENT", "DRAFT", bot_label_id}:
            return True
        sender = ""
        for header in message.get("payload", {}).get("headers", []):
            if header["name"].lower() == "from":
                sender = parseaddr(header["value"])[1].lower()
        if sender in own_addresses:
            return True
    return False


# ---------------------------------------------------------------------------
# Replying
# ---------------------------------------------------------------------------
def _build_reply(email: dict, text: str) -> dict:
    """Create a reply that Gmail shows in the same conversation (thread)."""
    message = MIMEText(text, "plain", "utf-8")
    message["To"] = email["reply_to"]
    message["From"] = config.OUR_ADDRESS
    subject = email["subject"]
    message["Subject"] = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    if email["message_id_header"]:
        message["In-Reply-To"] = email["message_id_header"]
        message["References"] = (email["references"] + " " + email["message_id_header"]).strip()
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    return {"raw": raw, "threadId": email["thread_id"]}


def create_draft(service, email: dict, text: str) -> str:
    draft = service.users().drafts().create(userId="me", body={"message": _build_reply(email, text)}).execute()
    return draft["id"]


def send_reply(service, email: dict, text: str) -> str:
    sent = service.users().messages().send(userId="me", body=_build_reply(email, text)).execute()
    return sent["id"]
