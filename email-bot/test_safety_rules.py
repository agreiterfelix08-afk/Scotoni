"""
Checks the safety rules that are plain code (no Claude, no Gmail, free).
Run with:   python -m unittest test_safety_rules.py
"""

import unittest

import classifier
import gmail_client
from classifier import Decision


def email(address="guest@example.com", headers=None, body="Hello"):
    return {"from_address": address, "headers": headers or {}, "body": body, "subject": "Hi"}


def answer(**changes):
    base = dict(category="ANSWER", topic="dogs", language="en", confident=True,
                reason="ok", reply="Dear guest,\n\ndogs are welcome.")
    base.update(changes)
    return Decision(**base)


class PreFilter(unittest.TestCase):
    def test_own_address_is_ignored(self):
        self.assertEqual(classifier.pre_filter(email("Info@Scotoni.it"))[0], "IGNORE")

    def test_no_reply_sender_is_ignored(self):
        for address in ["noreply@x.com", "no-reply@x.com", "do_not_reply@x.com", "MAILER-DAEMON@x.com"]:
            self.assertEqual(classifier.pre_filter(email(address))[0], "IGNORE", address)

    def test_automatic_and_newsletter_headers_are_ignored(self):
        self.assertEqual(classifier.pre_filter(email(headers={"auto-submitted": "auto-replied"}))[0], "IGNORE")
        self.assertEqual(classifier.pre_filter(email(headers={"list-unsubscribe": "<mailto:x>"}))[0], "IGNORE")
        self.assertEqual(classifier.pre_filter(email(headers={"precedence": "bulk"}))[0], "IGNORE")

    def test_normal_guest_goes_to_claude(self):
        self.assertIsNone(classifier.pre_filter(email(headers={"auto-submitted": "no"})))

    def test_very_long_email_needs_human(self):
        self.assertEqual(classifier.pre_filter(email(body="x" * 20000))[0], "NEEDS_HUMAN")


class SafetyRules(unittest.TestCase):
    def test_good_answer_passes(self):
        self.assertEqual(classifier.apply_safety_rules(answer()).category, "ANSWER")

    def test_not_confident_becomes_needs_human(self):
        self.assertEqual(classifier.apply_safety_rules(answer(confident=False)).category, "NEEDS_HUMAN")

    def test_empty_reply_becomes_needs_human(self):
        self.assertEqual(classifier.apply_safety_rules(answer(reply="  ")).category, "NEEDS_HUMAN")

    def test_phone_number_becomes_needs_human(self):
        result = classifier.apply_safety_rules(answer(reply="Call us at +39 0471 123 456."))
        self.assertEqual(result.category, "NEEDS_HUMAN")

    def test_dates_and_times_are_not_phone_numbers(self):
        self.assertFalse(classifier.looks_like_phone_number("Open 09:00 – 17:00, from 16.06.2026 to 04.10.2026."))

    def test_needs_human_never_keeps_a_reply(self):
        result = classifier.apply_safety_rules(answer(category="NEEDS_HUMAN"))
        self.assertEqual(result.reply, "")

    def test_signature_matches_language(self):
        self.assertIn("Ihr Team vom Rifugio Scotoni", classifier.full_reply(answer(language="de")))
        self.assertIn("Il team del Rifugio Scotoni", classifier.full_reply(answer(language="it")))


class ReplyFormat(unittest.TestCase):
    def test_reply_goes_to_same_thread_and_sender(self):
        import base64
        e = {"reply_to": "guest@example.com", "subject": "Dogs?", "message_id_header": "<abc@x>",
             "references": "", "thread_id": "T1"}
        built = gmail_client._build_reply(e, "Dear guest")
        raw = base64.urlsafe_b64decode(built["raw"]).decode()
        self.assertEqual(built["threadId"], "T1")
        self.assertIn("To: guest@example.com", raw)
        self.assertIn("Subject: Re: Dogs?", raw)
        self.assertIn("In-Reply-To: <abc@x>", raw)


class MainFlow(unittest.TestCase):
    """bot.handle_email with a fake Gmail and a fake Claude."""

    def run_flow(self, decision=None, already_handled=False, sender="guest@example.com", mode="draft",
                 test_mode=False, subject="Dogs?"):
        from unittest import mock
        import bot
        import config
        e = {"id": "M1", "thread_id": "T1", "from_address": sender, "headers": {}, "body": "Dogs?",
             "subject": subject, "reply_to": sender, "message_id_header": "", "references": ""}
        with mock.patch.object(config, "MODE", mode), \
             mock.patch.object(config, "TEST_MODE", test_mode), \
             mock.patch.object(bot, "log"), \
             mock.patch.object(gmail_client, "thread_already_handled", return_value=already_handled), \
             mock.patch.object(gmail_client, "add_labels") as add_labels, \
             mock.patch.object(gmail_client, "create_draft") as create_draft, \
             mock.patch.object(gmail_client, "send_reply") as send_reply, \
             mock.patch.object(classifier, "ask_claude", return_value=decision or answer()) as ask:
            bot.handle_email(None, e, {"human": "L_HUMAN", "replied": "L_BOT"})
        return add_labels, create_draft, send_reply, ask

    def test_draft_mode_only_drafts(self):
        add_labels, create_draft, send_reply, _ = self.run_flow()
        create_draft.assert_called_once()
        send_reply.assert_not_called()
        add_labels.assert_called_once_with(None, "M1", ["L_BOT"], mark_read=True)

    def test_send_mode_sends(self):
        _, create_draft, send_reply, _ = self.run_flow(mode="send")
        send_reply.assert_called_once()
        create_draft.assert_not_called()

    def test_needs_human_gets_label_and_stays_unread(self):
        add_labels, create_draft, send_reply, _ = self.run_flow(decision=answer(category="NEEDS_HUMAN"))
        add_labels.assert_called_once_with(None, "M1", ["L_HUMAN"], mark_read=False)
        create_draft.assert_not_called()
        send_reply.assert_not_called()

    def test_ignore_does_nothing(self):
        add_labels, create_draft, send_reply, _ = self.run_flow(decision=answer(category="IGNORE"))
        add_labels.assert_not_called()
        create_draft.assert_not_called()

    def test_never_replies_twice_in_a_thread(self):
        add_labels, create_draft, send_reply, ask = self.run_flow(already_handled=True)
        ask.assert_not_called()
        create_draft.assert_not_called()
        add_labels.assert_called_once_with(None, "M1", ["L_HUMAN"], mark_read=False)

    def test_own_address_is_never_answered(self):
        add_labels, create_draft, send_reply, ask = self.run_flow(sender="info@scotoni.it")
        ask.assert_not_called()
        create_draft.assert_not_called()
        add_labels.assert_not_called()

    def test_test_mode_skips_normal_emails(self):
        add_labels, create_draft, send_reply, ask = self.run_flow(test_mode=True, subject="Dinner on Friday?")
        ask.assert_not_called()
        add_labels.assert_not_called()
        create_draft.assert_not_called()

    def test_test_mode_handles_test_emails_and_hides_the_word_from_claude(self):
        add_labels, create_draft, send_reply, ask = self.run_flow(test_mode=True, subject="TESTBOT Dogs allowed?")
        self.assertEqual(ask.call_args.args[0]["subject"], "Dogs allowed?")
        create_draft.assert_called_once()
        # the reply keeps the original subject so Gmail threads it correctly
        self.assertEqual(create_draft.call_args.args[1]["subject"], "TESTBOT Dogs allowed?")


if __name__ == "__main__":
    unittest.main()
