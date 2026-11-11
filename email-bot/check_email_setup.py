"""
Step 0: find out who handles the email for scotoni.it.

Every domain publishes "MX records": a public list of the mail servers that
receive its email. Looking at them tells us if info@scotoni.it runs on Gmail
(Google Workspace) or on another provider.

Run it with:   python check_email_setup.py
"""

import sys

import dns.resolver

DOMAIN = sys.argv[1] if len(sys.argv) > 1 else "scotoni.it"

# Typical mail-server names of common providers, so we can tell you in words.
KNOWN_PROVIDERS = {
    "google.com": "Google Workspace (Gmail)",
    "googlemail.com": "Google Workspace (Gmail)",
    "outlook.com": "Microsoft 365 (Outlook)",
    "aruba.it": "Aruba",
    "register.it": "Register.it",
    "ovh.net": "OVH",
    "secureserver.net": "GoDaddy",
    "serverdata.net": "IONOS / 1&1",
    "ionos": "IONOS / 1&1",
    "zoho": "Zoho Mail",
    "netsons": "Netsons",
    "siteground": "SiteGround",
}


def main():
    print(f"Looking up the mail servers (MX records) for {DOMAIN} ...\n")
    try:
        answers = dns.resolver.resolve(DOMAIN, "MX")
    except Exception as error:
        print("Could not look them up:", error)
        print("Check your internet connection, or type this in Terminal instead:")
        print(f"    dig MX {DOMAIN} +short")
        return

    servers = sorted((r.preference, str(r.exchange).rstrip(".").lower()) for r in answers)
    for preference, server in servers:
        print(f"  priority {preference:>3}:  {server}")
    print()

    names = " ".join(server for _, server in servers)
    found = {label for key, label in KNOWN_PROVIDERS.items() if key in names}

    if any("google" in server for _, server in servers):
        print("RESULT: Google Workspace (Gmail).")
        print("Good news: the bot in this folder (Gmail API, coloured labels) is the right one.")
    else:
        print("RESULT: NOT Gmail.", f"Provider looks like: {', '.join(found)}" if found else "")
        print("This bot is written for the Gmail API, so it will not work as it is.")
        print("Tell Claude Code what this script printed, and ask for the IMAP/SMTP version.")


if __name__ == "__main__":
    main()
