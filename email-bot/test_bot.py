"""
Try the bot on 15 FAKE emails. Gmail is NOT touched: nothing is read, labelled,
drafted or sent. It only shows how each email would be classified and what the
reply would say.

Run it with:   python test_bot.py
(It calls Claude 12 or so times, which costs a few cents.)
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import classifier  # noqa: E402

# expected = what a careful human would decide. The test compares it with Claude.
FAKE_EMAILS = [
    # ---- simple questions (ANSWER) ----
    dict(expected="ANSWER", from_name="Giulia Bianchi", from_address="giulia.bianchi@example.it",
         subject="Orari", body="Buongiorno, a che ora aprite e fino a che ora si può mangiare caldo? Grazie, Giulia Bianchi"),
    dict(expected="ANSWER", from_name="Thomas Huber", from_address="t.huber@example.de",
         subject="Anfahrt im Sommer", body="Hallo, kann man mit dem Auto bis zur Hütte fahren oder gibt es einen Shuttle? Viele Grüße, Thomas Huber"),
    dict(expected="ANSWER", from_name="Emma Clarke", from_address="emma.clarke@example.co.uk",
         subject="Coeliac", body="Hi, my daughter has coeliac disease. Do you have gluten free food? Thanks, Emma"),
    dict(expected="ANSWER", from_name="Lukas Mair", from_address="lukas.mair@example.at",
         subject="Hund", body="Grüß Gott, dürfen wir unseren Hund mitnehmen? Und kann man mit American Express bezahlen? Lukas Mair"),
    dict(expected="ANSWER", from_name="", from_address="sciatore88@example.com",
         subject="Apertura inverno", body="Quando aprite quest'inverno? E quando apre la funivia del Lagazuoi?"),
    dict(expected="ANSWER", from_name="Mark Peters", from_address="mark.peters@example.com",
         subject="Room on 14 August", body="Hello, your website shows the double room as booked on 14 August. Is there really nothing left? Maybe something you keep free? Mark"),
    dict(expected="ANSWER", from_name="Sara Rossi", from_address="sara.rossi@example.it",
         subject="Numero di telefono", body="Salve, potete mandarmi il vostro numero di telefono? Sara"),
    # ---- needs a human ----
    dict(expected="NEEDS_HUMAN", from_name="Anna Weber", from_address="anna.weber@example.de",
         subject="Tischreservierung", body="Guten Tag, ich möchte für Samstag 12:30 einen Tisch für 4 Personen reservieren. Anna Weber"),
    dict(expected="NEEDS_HUMAN", from_name="Marco Verdi", from_address="marco.verdi@example.it",
         subject="Candidatura cameriere", body="Buongiorno, vorrei candidarmi come cameriere per la stagione estiva. Allego il mio CV. Marco Verdi"),
    dict(expected="NEEDS_HUMAN", from_name="Julia Smith", from_address="julia.smith@example.com",
         subject="Lost sunglasses", body="Hi, I think I left my sunglasses on the terrace yesterday afternoon. Did you find them? Julia"),
    dict(expected="NEEDS_HUMAN", from_name="Paolo Neri", from_address="paolo.neri@example.it",
         subject="Cani e disdetta", body="Buongiorno, i cani sono ammessi? Inoltre devo annullare la prenotazione della camera del 3 luglio. Paolo Neri"),
    dict(expected="NEEDS_HUMAN", from_name="Redaktion Bergwelt", from_address="redaktion@bergwelt-magazin.example",
         subject="Presseanfrage", body="Sehr geehrte Damen und Herren, wir schreiben eine Reportage über Hütten in Alta Badia und würden Sie gern interviewen."),
    dict(expected="NEEDS_HUMAN", from_name="Mario", from_address="mario@example.it",
         subject="Prezzi", body="Quanto costa una camera doppia con mezza pensione?"),
    # ---- ignore ----
    dict(expected="IGNORE", from_name="Booking System", from_address="noreply@bookingsystem.example",
         subject="New reservation #48213", body="A new reservation was created for 12/08. This is an automatic message."),
    dict(expected="IGNORE", from_name="SEO Experts", from_address="growth@seo-rank-fast.example",
         subject="Get your hut to #1 on Google!!!", body="Dear owner, we guarantee first page Google ranking in 7 days. Reply now for 50% discount!"),
]


def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("No ANTHROPIC_API_KEY found. Create the .env file first (README, step 3).")

    matches = 0
    for number, email in enumerate(FAKE_EMAILS, start=1):
        email.setdefault("headers", {})
        decision, used_claude = classifier.classify(email)
        ok = decision.category == email["expected"]
        matches += ok

        print("=" * 78)
        print(f"#{number}  From: {email['from_address']}   Subject: {email['subject']}")
        print(f"     Email: {email['body']}")
        print(f"  -> Category: {decision.category}  (expected {email['expected']})  {'OK' if ok else '<<< DIFFERENT'}")
        print(f"     Topic: {decision.topic} | Language: {decision.language} | "
              f"{'Claude' if used_claude else 'simple rule, no Claude call'}")
        print(f"     Reason: {decision.reason}")
        if decision.category == classifier.ANSWER:
            print("     ---- reply that would be drafted ----")
            for line in classifier.full_reply(decision).splitlines():
                print("     | " + line)

    print("=" * 78)
    print(f"{matches} of {len(FAKE_EMAILS)} emails classified as expected.")


if __name__ == "__main__":
    main()
