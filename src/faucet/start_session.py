import sys
import time
import json
import os
from camoufox.sync_api import Camoufox

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

target_address = sys.argv[1] if len(sys.argv) > 1 else ""
session_file = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "current_session.txt")
FAUCET_URL = "https://faucet.testnet.qms.finance/"

if not target_address:
    print("Error: Target address required.")
    sys.exit(1)

prefs = {
    "privacy.bounceTrackingProtection.enabled": False,
    "privacy.trackingprotection.enabled": False,
    "dom.webnotifications.enabled": False
}

captured_session = {}

def handle_response(response):
    if "/api/startSession" in response.url:
        try:
            data = response.json()
            if data.get("session"):
                captured_session["data"] = data
        except Exception:
            pass

with Camoufox(headless=True, firefox_user_prefs=prefs) as browser:
    page = browser.new_page()
    page.on("response", handle_response)

    print("Membuka portal faucet...")
    page.goto(FAUCET_URL, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_selector("#faucet-wallet-address", timeout=20000)

    print(f"Mengisi target wallet: {target_address}...")
    page.evaluate("""(addr) => {
        const input = document.querySelector("#faucet-wallet-address");
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeSetter.call(input, addr);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }""", target_address)

    print("Memicu tombol 'Start Mining'...")
    try:
        page.click('button:has-text("Start Mining"), button[type="submit"]', timeout=5000)
    except Exception:
        pass

    print("Menunggu penyelesaian Cloudflare Turnstile...")
    token = None
    for i in range(60):
        if captured_session.get("data"):
            break

        token = page.evaluate("() => document.querySelector('input[name=\"cf-turnstile-response\"]')?.value")
        if token and len(token) > 10:
            print(f"✔ Turnstile lolos dalam {i+1} detik! Token: {token[:16]}...")
            break
        
        # Setiap 10 detik pemicu ulang interaksi Turnstile jika belum terverifikasi
        if (i > 0 and i % 10 == 0) or i == 3:
            try:
                page.click('button:has-text("Start Mining"), button[type="submit"]', timeout=3000)
            except Exception:
                pass

        try:
            for frame in page.frames:
                if "challenges.cloudflare.com" in frame.url:
                    box = frame.query_selector('input[type="checkbox"], #challenge-stage, #cf-stage, body')
                    if box:
                        box.click()
        except Exception:
            pass
        time.sleep(1)

    # Jika sesi belum didapat tapi token sudah ada, panggil /api/startSession secara eksplisit
    if not captured_session.get("data"):
        if not token:
            print("Gagal menyelesaikan verifikasi Cloudflare Turnstile.")
            sys.exit(1)

        print("Menginisialisasi sesi dengan captcha token...")
        result = page.evaluate("""async ([addr, token]) => {
            try {
                const res = await fetch("/api/startSession?cliver=2.5.1", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ addr: addr, captchaToken: token })
                });
                return await res.json();
            } catch (e) {
                return { status: "failed", failedReason: e.toString() };
            }
        }""", [target_address, token])
        captured_session["data"] = result

    res_data = captured_session.get("data", {})
    if res_data.get("status") == "running" or res_data.get("session"):
        session_id = res_data.get("session")
        with open(session_file, "w") as f:
            f.write(session_id)
        print(f"SESSION_ID={session_id}")
        sys.exit(0)
    else:
        err = res_data.get("failedReason") or res_data.get("failedCode") or "Unknown error"
        print(f"Server Error: {err}")
        sys.exit(1)
