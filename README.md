# ⚡ QMS Testnet & QWAP Auto Daily Streak + Faucet Bot

> ⚠️ **DISCLAIMER / PERNYATAAN PENTING:**  
> **Repository ini dibuat semata-mata untuk tujuan EDUKASI, RISET TEKNOLOGI BLOCKCHAIN, dan PEMBELAJARAN (Educational & Research Purposes Only).**  
> Proyek ini bertujuan untuk mempelajari interaksi smart contract EVM (DEX Swap & Liquidity Pool) serta otomatisasi interaksi browser. Penulis dan kontributor **tidak bertanggung jawab** atas segala bentuk kerugian aset, kegagalan transaksi, pemblokiran akun, atau risiko apa pun yang timbul akibat penggunaan skrip ini. Gunakan hanya pada jaringan Testnet dengan token uji coba tanpa nilai moneter riil. Selalu amankan private key Anda sendiri dan jangan pernah membagikannya kepada siapa pun!

---

Bot otomatis modular, presisi, dan performa tinggi untuk mengotomatiskan rutinitas harian (*Daily Streak*) di DEX **QWAP** pada jaringan **QMS Testnet (Layer 1)**. Dilengkapi pelacak **Quanta Points**, proteksi auto-retry, anti-sybil jitter, dan modul PoW faucet mining.

---

## 🚀 Quick Start / Panduan Cepat

Setup cepat dalam 3 langkah:

### 1. Clone & Install Dependencies
Pastikan komputer Anda sudah terpasang [Node.js (v18+)](https://nodejs.org/).
```bash
git clone https://github.com/USERNAME/qms-qwap-streak-bot.git
cd qms-qwap-streak-bot
npm install
```

### 2. Jalankan Wizard Persiapan Otomatis
```bash
npm run setup
```
Perintah ini akan otomatis membuatkan file konfigurasi `.env` dan `wallets.json`.

Buka file `wallets.json` dengan teks editor (Notepad / VS Code) dan masukkan private key wallet Anda:
```json
[
  {
    "name": "Wallet 1",
    "privateKey": "0xYOUR_PRIVATE_KEY_1"
  },
  {
    "name": "Wallet 2",
    "privateKey": "0xYOUR_PRIVATE_KEY_2"
  }
]
```
*(Bisa untuk 1 wallet saja maupun banyak wallet sekaligus)*.

### 3. Jalankan Bot!
```bash
npm start
```
Bot akan otomatis mengecek saldo, melakukan Swap QMS $\rightarrow$ USDC, menambahkan Liquidity ke pool, dan mencatat streak harian Anda!

---

## 📋 Daftar Perintah Lengkap (Cheatsheet)

Semua perintah sudah disiapkan di `npm run` agar sangat mudah digunakan:

| Perintah | Deskripsi Singkat |
|---|---|
| `npm run setup` | Menyiapkan template file `.env` dan `wallets.json` secara otomatis |
| `npm start` | Menjalankan rutinitas harian (Swap + Add LP) untuk semua wallet |
| `npm run status` | Melihat tabel saldo QMS & USDC, streak saat ini, dan perolehan poin |
| `npm run force` | Memaksa eksekusi ulang meskipun tugas hari ini sudah tercatat selesai |
| `npm run faucet` | Membuka browser ringan untuk mining & klaim token testnet gratis |
| `npm run distribute` | Membagikan saldo QMS dari Wallet Utama ke seluruh Sub-Wallet |
| `npm run daemon` | Menjalankan bot 24/7 di latar belakang sesuai jadwal cron harian |
| `npm run generate-wallet` | Menghasilkan alamat wallet EVM baru untuk pengujian |

---

## 🚰 Menggunakan Faucet Mining Otomatis

Jika wallet baru Anda belum memiliki saldo testnet QMS:
1. Pastikan Python 3 sudah terpasang.
2. Install library browser:
   ```bash
   pip install camoufox[geoip] playwright
   python -m playwright install firefox
   ```
3. Jalankan klaim faucet:
   ```bash
   npm run faucet
   ```
Browser anti-deteksi Camoufox akan otomatis melewati Turnstile, melakukan PoW mining, dan mentransfer token QMS ke wallet Anda.

---

## 🌟 Fitur Unggulan

- 🛡️ **Aman & Terisolasi**:
  - File berisi private key (`.env`, `wallets.json`) sudah otomatis masuk `.gitignore` sehingga tidak akan pernah bocor ke GitHub.
  - Private key disensor (*masked*) pada log terminal (`0x0c53...0ade`).
- 🔁 **Auto-Retry & Fault Tolerance**:
  - Jika RPC Testnet mengalami lonjakan latensi atau timeout, bot otomatis mengulang transaksi hingga 2–3 kali tanpa crash.
  - Kegagalan pada 1 wallet tidak akan menghentikan eksekusi wallet lainnya.
- 🎲 **Anti-Sybil Random Jitter**:
  - Nominal swap & add LP diacak secara proporsional.
  - Jeda waktu acak antar-wallet (15–45 detik) untuk menghindari pola bot.
- 📈 **Pelacak Streak & Quanta Points**:
  - Menghitung streak 7 hari (`Day 1/7` hingga `Day 7/7`).
  - Menghitung akumulasi Quanta Points (8 poin/hari atau 10 poin/hari untuk role Discord Pioneer).

---

## 🌐 Detail Jaringan QMS Testnet

| Parameter | Nilai |
|---|---|
| **Network Name** | QMS Testnet |
| **Chain ID** | `19480` (Hex: `0x4c18`) |
| **RPC URL** | `https://rpc.testnet.qms.finance` |
| **Currency Symbol** | `QMS` |
| **Block Explorer** | [https://testnet.qmsscan.io/](https://testnet.qmsscan.io/) |
| **DEX Portal** | [https://testnet.qwap.xyz/](https://testnet.qwap.xyz/) |
| **Official Faucet** | [https://faucet.testnet.qms.finance/](https://faucet.testnet.qms.finance/) |

---

## ⚖️ Lisensi & Tanggung Jawab

Distributed under the **ISC License**.  
Kode ini disediakan "sebagaimana adanya" (*as-is*), tanpa jaminan apa pun baik tersurat maupun tersirat. Harap gunakan secara bijak dan bertanggung jawab.
