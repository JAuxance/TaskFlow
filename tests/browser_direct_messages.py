"""Run with: python -m tests.browser_direct_messages (ports 5000/5500 must be free)."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import logging

from playwright.sync_api import sync_playwright, expect
from werkzeug.serving import make_server

from tests.test_direct_messages import DirectMessagesTest, app


class QuietFiles(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    DirectMessagesTest.setUpClass()
    fixture = DirectMessagesTest()
    fixture.setUp()
    api = make_server("localhost", 5000, app, threaded=True)
    frontend = ThreadingHTTPServer(("localhost", 5500), partial(QuietFiles, directory="frontend"))
    for server in (api, frontend):
        Thread(target=server.serve_forever, daemon=True).start()
    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            contexts = []

            def open_conversation(user_id, recipient, mobile=False):
                context = browser.new_context(viewport={"width": 390 if mobile else 1440, "height": 900})
                contexts.append(context)
                context.add_cookies([{
                    "name": "session", "value": fixture.clients[user_id].get_cookie("session").value,
                    "domain": "localhost", "path": "/", "httpOnly": True, "sameSite": "Lax",
                }])
                page = context.new_page()
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto("http://localhost:5500")
                page.locator("#workspace-list").get_by_role("button", name="Team").click()
                page.get_by_role("tab", name="Members").click()
                own_name = {1: "Alice", 2: "Bob", 3: "Charlie"}[user_id]
                expect(page.get_by_role("button", name=f"Send a private message to {own_name}")).to_have_count(0)
                page.get_by_role("button", name=f"Send a private message to {recipient}").click()
                expect(page.locator("h1")).to_have_text("Direct messages")
                expect(page.locator(".chat-status")).to_have_text("Live", timeout=15000)
                return page

            alice = open_conversation(1, "Bob")
            bob = open_conversation(2, "Alice", mobile=True)
            charlie = open_conversation(3, "Alice")
            expect(alice.get_by_role("button", name="Send message", exact=True)).to_be_disabled()
            alice.get_by_label("Message", exact=True).fill("Bonjour Bob 👋")
            alice.get_by_label("Message", exact=True).press("Enter")
            for page in (alice, bob):
                expect(page.locator(".chat-message-body")).to_have_text(["Bonjour Bob 👋"])
            expect(charlie.locator(".chat-message-body")).to_have_count(0)
            expect(alice.locator(".chat-message-own")).to_have_count(1)
            expect(bob.locator(".chat-message-own")).to_have_count(0)
            print("PASS: live delivery, no duplicates, sender identity, third-party isolation")

            bob.get_by_label("Message", exact=True).fill("Salut Alice")
            bob.get_by_label("Message", exact=True).press("Shift+Enter")
            bob.get_by_label("Message", exact=True).press("End")
            bob.get_by_label("Message", exact=True).type("<img src=x onerror=alert(1)>")
            bob.get_by_role("button", name="Send message", exact=True).click()
            expect(alice.locator(".chat-message-body")).to_have_count(2)
            expect(alice.locator(".chat-message-body").last).to_contain_text("<img src=x onerror=alert(1)>")
            expect(alice.locator(".chat-message-body img")).to_have_count(0)
            print("PASS: reply, multiline message, HTML rendered as text")

            alice.get_by_role("button", name="Back to members").click()
            alice.get_by_role("button", name="Send a private message to Bob").click()
            expect(alice.locator(".chat-message-body")).to_have_count(2)
            expect(alice.locator(".chat-status")).to_have_text("Live")
            print("PASS: history restored after navigation")

            contexts[1].set_offline(True)
            expect(bob.locator(".chat-status")).to_have_text("Offline")
            with fixture.connect() as conn:
                for i in range(55):
                    conn.execute("INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES (1, 2, %s)", (f"Offline message {i}",))
            contexts[1].set_offline(False)
            expect(bob.locator(".chat-status")).to_have_text("Live")
            expect(bob.locator(".chat-message-body")).to_have_count(57)
            print("PASS: reconnect recovers more than one page of missed messages")

            alice.get_by_role("button", name="Back to members").click()
            alice.get_by_role("button", name="Send a private message to Bob").click()
            expect(alice.locator(".chat-message-body")).to_have_count(50)
            alice.get_by_role("button", name="Load older messages").click()
            expect(alice.locator(".chat-message-body")).to_have_count(57)
            print("PASS: loading older history")

            alice.route("**/api/users/2/direct_messages", lambda route: route.fulfill(status=500, content_type="application/json", body='{"error":"Temporary failure"}'))
            alice.get_by_label("Message", exact=True).fill("Keep this draft")
            alice.get_by_role("button", name="Send message", exact=True).click()
            expect(alice.locator(".chat-send-error")).to_have_text("Temporary failure")
            expect(alice.get_by_label("Message", exact=True)).to_have_value("Keep this draft")
            alice.unroute("**/api/users/2/direct_messages")
            print("PASS: failed send keeps draft and displays error")

            assert bob.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Mobile overflow"
            bob.screenshot(path="/tmp/taskflow-direct-messages-mobile.png", full_page=True)
            alice.screenshot(path="/tmp/taskflow-direct-messages-desktop.png", full_page=True)
            print("PASS: mobile layout fits viewport")

            with fixture.connect() as conn:
                conn.execute("DELETE FROM workspace_members WHERE user_id = 2")
            alice.get_by_role("button", name="Refresh", exact=True).click()
            expect(alice.get_by_label("Message", exact=True)).to_be_disabled()
            expect(alice.locator(".chat-history-error")).to_contain_text("unavailable")
            print("PASS: removed membership disables conversation")

            # The shared chat renderer must continue to support workspace messages.
            alice.get_by_role("button", name="Back to members").click()
            alice.get_by_role("tab", name="Messages", exact=True).click()
            expect(alice.locator(".chat-status")).to_have_text("Live")
            alice.get_by_label("Message", exact=True).fill("Workspace regression check")
            alice.get_by_role("button", name="Send message", exact=True).click()
            expect(alice.locator(".chat-message-body")).to_have_text(["Workspace regression check"])
            print("PASS: workspace chat still sends and displays messages")
            assert not errors, errors
            print("PASS: no JavaScript exceptions")
            browser.close()
    finally:
        for server in (api, frontend):
            server.shutdown()
            server.server_close()
        fixture.tearDown()
        DirectMessagesTest.tearDownClass()


if __name__ == "__main__":
    main()
