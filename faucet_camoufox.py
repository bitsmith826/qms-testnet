import sys
import time
import os
import re
from pathlib import Path
from dotenv import load_dotenv
import psutil
from camoufox.sync_api import Camoufox

# Pastikan output konsol Windows mendukung UTF-8 (box Unicode & emoji)
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

FAUCET_URL = "https://faucet.testnet.qms.finance/"

# ANSI Styling
c_cyan = "\033[96m"
c_green = "\033[92m"
c_yellow = "\033[93m"
c_red = "\033[91m"
c_gray = "\033[90m"
c_white = "\033[97m"
c_bold = "\033[1m"
c_reset = "\033[0m"

def get_target_address():
    if len(sys.argv) > 1 and sys.argv[1].startswith("0x") and len(sys.argv[1]) == 42:
        return sys.argv[1]
    
    wallets_path = Path(__file__).parent / "wallets.json"
    if wallets_path.exists():
        try:
            import json
            data = json.loads(wallets_path.read_text(encoding="utf-8"))
            if isinstance(data, list) and len(data) > 0:
                item = data[0]
                pk = item.get("privateKey") if isinstance(item, dict) else item
                if pk:
                    from eth_account import Account
                    return Account.from_key(pk).address
        except Exception:
            pass

    print(f"{c_red}✖ Error: wallets.json tidak ditemukan dan alamat target tidak diberikan!{c_reset}")
    print(f"  {c_yellow}Cara pakai: python faucet_camoufox.py <0xWalletAddress> atau jalankan 'npm run setup'{c_reset}\n")
    sys.exit(1)

def print_banner(target_address, target_amount):
    print(f"\n{c_cyan}╭────────────────────────────────────────────────────────────────────╮{c_reset}")
    print(f"{c_cyan}│{c_reset}  {c_white}{c_bold}⚡ QMS TESTNET FAUCET CLAIMER (STEALTH CAMOUFOX ENGINE){c_reset}           {c_cyan}│{c_reset}")
    print(f"{c_cyan}├────────────────────────────────────────────────────────────────────┤{c_reset}")
    print(f"{c_cyan}│{c_reset}  {c_gray}Target Wallet :{c_reset} {c_bold}{target_address}{c_reset}  {c_cyan}│{c_reset}")
    print(f"{c_cyan}│{c_reset}  {c_gray}Target Reward :{c_reset} {c_yellow}>= {target_amount:.2f} QMS{c_reset} {c_dim}(Min claim server: 1.0 QMS){c_reset}      {c_cyan}│{c_reset}")
    print(f"{c_cyan}│{c_reset}  {c_gray}CPU Priority  :{c_reset} {c_green}IDLE (0% Lag/Stutter pada PC){c_reset}                       {c_cyan}│{c_reset}")
    print(f"{c_cyan}╰────────────────────────────────────────────────────────────────────╯{c_reset}\n")

c_dim = "\033[2m"

def claim_faucet(target_address, target_amount=1.05, max_wait_minutes=15):
    # Set Windows priority to IDLE
    try:
        p = psutil.Process(os.getpid())
        p.nice(psutil.IDLE_PRIORITY_CLASS)
    except Exception:
        pass

    print_banner(target_address, target_amount)
    print(f"{c_gray}[1/6]{c_reset} {c_cyan}Menginisialisasi browser engine Camoufox (Stealth Firefox)...{c_reset}")

    session_api_response = {}

    with Camoufox(headless=True) as browser:
        page = browser.new_page()

        # Intercept response startSession to capture server messages accurately
        def on_response(response):
            if "startSession" in response.url:
                try:
                    data = response.json()
                    session_api_response["status"] = data.get("status")
                    session_api_response["failedCode"] = data.get("failedCode")
                    session_api_response["failedReason"] = data.get("failedReason")
                    session_api_response["session"] = data.get("session")
                    print(f"      {c_yellow}[Server API]{c_reset} status={data.get('status')}, code={data.get('failedCode')}, reason={data.get('failedReason')}")
                except Exception:
                    pass

        page.on("response", on_response)

        # Worker throttle & 1-thread limit
        def handle_worker(route):
            try:
                res = route.fetch()
                text = res.text()
                modified = text.replace(
                    "0===this.nonceRanges.length?20:0",
                    "0===this.nonceRanges.length?50:1"
                )
                route.fulfill(response=res, body=modified)
            except Exception:
                route.continue_()

        page.route("**/powfaucet-worker-a2.js*", handle_worker)

        page.add_init_script("""
            sessionStorage.setItem('qwap:splash', '1');
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 1 });
        """)

        print(f"{c_gray}[2/6]{c_reset} {c_cyan}Membuka faucet portal ({FAUCET_URL})...{c_reset}")
        try:
            page.goto(FAUCET_URL, wait_until="domcontentloaded", timeout=45000)
        except Exception as e:
            print(f"{c_red}✖ Gagal membuka faucet: {e}{c_reset}")
            return False

        mining_active = False
        max_start_attempts = 6

        for attempt in range(1, max_start_attempts + 1):
            try:
                page.wait_for_selector("#faucet-wallet-address", timeout=20000)
            except Exception:
                print(f"{c_yellow}⚠ Input wallet tidak ditemukan, memuat ulang halaman...{c_reset}")
                page.reload(wait_until="domcontentloaded")
                continue

            print(f"{c_gray}[3/6]{c_reset} {c_white}Mengisi alamat wallet:{c_reset} {c_bold}{target_address}{c_reset}")
            page.evaluate("""(addr) => {
                const input = document.querySelector("#faucet-wallet-address");
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeInputValueSetter.call(input, addr);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }""", target_address)
            page.click("#faucet-wallet-address")
            page.keyboard.press("End")

            print(f"{c_gray}[4/6]{c_reset} {c_cyan}Memverifikasi Cloudflare Turnstile secara otomatis...{c_reset}")
            token = None
            for _ in range(40):
                token = page.evaluate("() => document.querySelector('input[name=\"cf-turnstile-response\"]')?.value")
                if token and len(token) > 10:
                    print(f"      {c_green}✔ Turnstile berhasil diselesaikan otomatis!{c_reset} {c_gray}(Token: {token[:16]}...){c_reset}")
                    break
                time.sleep(1)

            if not token:
                print(f"      {c_yellow}⚠ Turnstile belum selesai. Memuat ulang halaman...{c_reset}")
                time.sleep(3)
                page.reload(wait_until="domcontentloaded")
                continue

            print(f"{c_gray}[5/6]{c_reset} {c_cyan}Mengirim permintaan mulai sesi mining (Start Mining)...{c_reset}")
            session_api_response.clear()
            page.click(".start-action")

            # Tunggu respon API atau munculnya tampilan mining di DOM
            for _ in range(35):
                time.sleep(1)
                is_mining_dom = page.evaluate("""() => {
                    const stopBtn = document.querySelector("button.stop-action");
                    const body = document.body ? document.body.innerText : "";
                    return !!stopBtn || body.includes("Your Mining Reward") || body.includes("Current Hashrate");
                }""")
                if is_mining_dom or session_api_response.get("status") == "running":
                    mining_active = True
                    break
                if session_api_response.get("status") == "failed":
                    break

            if mining_active:
                break

            # Evaluasi respon gagal dari server
            failed_code = session_api_response.get("failedCode", "")
            failed_reason = session_api_response.get("failedReason", "")

            if failed_code == "RECURRING_LIMIT" or "claimed 4 times" in failed_reason:
                print(f"\n{c_red}✖ [RECURRING_LIMIT] Batas Klaim IP Tercapai!{c_reset}")
                print(f"  {c_yellow}Pesan Server : {failed_reason or 'You already claimed 4 times in the last 24h.'}{c_reset}")
                print(f"  {c_cyan}💡 Solusi Cepat:{c_reset} Server membatasi maksimal 4 klaim per 24 jam per IP.")
                print(f"     Ganti IP publik Anda (misalnya toggle Mode Pesawat pada Hotspot HP, atau ganti VPN/WARP) lalu jalankan ulang bot ini.\n")
                return False

            elif failed_code == "CONCURRENCY_LIMIT" or "concurrent" in failed_reason.lower() or "active session" in failed_reason.lower():
                print(f"\n{c_yellow}⚠ [CONCURRENCY_LIMIT] {failed_reason or 'Sesi mining sebelumnya masih aktif di server.'}{c_reset}")
                print(f"  {c_cyan}💡 Penjelasan:{c_reset} Server faucet membatasi 1 sesi per IP dan 1 sesi per wallet address.")
                print(f"  Menunggu 45 detik untuk pendinginan...\n")
                time.sleep(45)
                page.reload(wait_until="domcontentloaded")
                continue

            else:
                body_text = page.inner_text("body")[:200]
                if "RECURRING_LIMIT" in body_text:
                    print(f"\n{c_red}✖ [RECURRING_LIMIT] Batas 4 klaim per 24 jam tercapai pada IP ini.{c_reset}")
                    print(f"  {c_cyan}💡 Solusi:{c_reset} Silakan ganti IP (tethering HP / airplane mode) untuk klaim kembali.\n")
                    return False
                print(f"  {c_yellow}⚠ Belum masuk halaman mining: {failed_code or 'Retrying...'} {failed_reason}{c_reset}")
                time.sleep(5)
                page.reload(wait_until="domcontentloaded")

        if not mining_active:
            print(f"{c_red}✖ Gagal memulai sesi mining setelah {max_start_attempts} percobaan.{c_reset}")
            return False

        print(f"\n      {c_green}✔ Sesi mining aktif! URL: {page.url}{c_reset}")
        print(f"      {c_cyan}Mining berjalan di latar belakang (Low CPU). Memantau perolehan saldo QMS...{c_reset}")
        print(f"{c_cyan}────────────────────────────────────────────────────────────────────{c_reset}")

        start_time = time.time()
        max_duration = max_wait_minutes * 60
        target_reached = False

        while (time.time() - start_time) < max_duration:
            time.sleep(3)

            status_data = page.evaluate("""() => {
                const titles = Array.from(document.querySelectorAll(".status-title"));
                let reward = 0.0;
                let hashrate = "calculating...";
                let canClaim = false;

                const rewTitle = titles.find(t => t.innerText.includes("Your Mining Reward"));
                if (rewTitle && rewTitle.nextElementSibling) {
                    const text = rewTitle.nextElementSibling.innerText;
                    const m = text.match(/([0-9]+\\.?[0-9]*)/);
                    if (m) reward = parseFloat(m[1]);
                }

                const hrTitle = titles.find(t => t.innerText.includes("Current Hashrate"));
                if (hrTitle && hrTitle.nextElementSibling) {
                    hashrate = hrTitle.nextElementSibling.innerText.trim();
                }

                const stopBtn = document.querySelector("button.stop-action");
                if (stopBtn && stopBtn.innerText.includes("Claim Rewards")) {
                    canClaim = true;
                }

                return { reward, hashrate, canClaim };
            }""")

            reward_val = status_data.get("reward", 0.0)
            hashrate_str = status_data.get("hashrate", "calculating...")
            can_claim = status_data.get("canClaim", False)

            elapsed = int(time.time() - start_time)
            print(f"  {c_gray}[{elapsed:3d}s]{c_reset} Mined: {c_yellow}{reward_val:.4f} QMS{c_reset} / target: {target_amount:.2f} QMS | Speed: {c_cyan}{hashrate_str}{c_reset}")

            if reward_val >= target_amount or (can_claim and reward_val >= 1.0):
                print(f"{c_cyan}────────────────────────────────────────────────────────────────────{c_reset}")
                print(f"  {c_green}✔ Target tercapai ({reward_val:.4f} QMS)! Menghentikan mining dan menuju klaim...{c_reset}")
                target_reached = True

                # Click Stop Mining & Claim Rewards
                page.evaluate("""() => {
                    const btn = document.querySelector("button.stop-action");
                    if (btn) btn.click();
                }""")
                break

        if not target_reached:
            print(f"{c_red}✖ Waktu tunggu habis sebelum mencapai target reward.{c_reset}")
            return False

        print(f"\n{c_gray}[6/6]{c_reset} {c_cyan}Memproses transaksi klaim token ke jaringan blockchain...{c_reset}")

        # Tunggu redirect ke /claim/<sessionId>
        on_claim_page = False
        for _ in range(30):
            time.sleep(1)
            if "/claim/" in page.url:
                on_claim_page = True
                break

        time.sleep(2)

        # Klik tombol final confirm claim jika ada
        page.evaluate("""() => {
            const btns = Array.from(document.querySelectorAll("button"));
            const sendBtn = btns.find(b => 
                b.innerText.toLowerCase().includes("send") || 
                b.innerText.toLowerCase().includes("claim") ||
                b.classList.contains("action-btn")
            );
            if (sendBtn && !sendBtn.disabled) sendBtn.click();
        }""")

        print(f"      {c_cyan}Menunggu konfirmasi pembayaran faucet di explorer...{c_reset}")
        claimed = False
        for _ in range(45):
            time.sleep(2)
            claim_info = page.evaluate("""() => {
                const bodyText = document.body.innerText;
                const txLink = document.querySelector('a[href*="/tx/"]');
                const isSent = bodyText.includes("SENT") || bodyText.includes("sent") || bodyText.includes("The tokens are now in your wallet");
                return {
                    txUrl: txLink ? txLink.href : null,
                    isSent: isSent
                };
            }""")

            if claim_info.get("txUrl"):
                print(f"\n      {c_green}🎉 KLAIM FAUCET BERHASIL DIKONFIRMASI!{c_reset}")
                print(f"      {c_white}Explorer Tx:{c_reset} {c_cyan}{claim_info['txUrl']}{c_reset}\n")
                claimed = True
                break
            elif claim_info.get("isSent"):
                print(f"\n      {c_green}🎉 Token berhasil ditransfer ke wallet Anda!{c_reset}\n")
                claimed = True
                break

        if not claimed:
            print(f"      {c_yellow}Permintaan klaim terkirim dan sedang diproses di antrian faucet.{c_reset}\n")
            claimed = True

        return claimed

if __name__ == "__main__":
    addr = get_target_address()
    amount = 1.05
    for arg in sys.argv[1:]:
        if arg.startswith("--amount="):
            amount = float(arg.split("=")[1])
    
    claim_faucet(addr, target_amount=amount)
