const { ethers } = require("ethers");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const logger = require("./src/utils/logger");
const { c } = logger;
const config = require("./src/config");
const { runMinerEngine } = require("./src/faucet/miner_engine");

const FAUCET_DIR = path.join(__dirname, "src", "faucet");

async function main() {
  logger.banner();

  console.log(`${c.bCyan}┌─── ⚡ HIGH-SPEED FAUCET HARVESTER & ON-CHAIN RELAY ───────────┐${c.reset}`);
  console.log(`│  Metode  : Relay via Temporary Fresh EVM Key (Bypass Wallet Lock)│`);
  console.log(`│  Engine  : Multi-Threaded WASM Argon2 PoW (~200 H/s)             │`);
  console.log(`│  Jaringan: QMS Testnet (Chain ID 19480)                          │`);
  console.log(`${c.bCyan}└──────────────────────────────────────────────────────────────────┘${c.reset}\n`);

  // 1. Tentukan Wallet Tujuan Utama (Wallet 1 dari wallets.json)
  const walletsPath = path.join(__dirname, "wallets.json");
  let mainTargetAddress = null;
  if (fs.existsSync(walletsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(walletsPath, "utf-8"));
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        const pk = typeof item === "string" ? item : item.privateKey;
        if (pk) {
          const w = new ethers.Wallet(pk);
          mainTargetAddress = w.address;
        }
      }
    } catch {}
  }

  if (!mainTargetAddress) {
    logger.error("File wallets.json tidak ditemukan atau tidak memiliki private key valid!");
    logger.info("Jalankan 'npm run setup' terlebih dahulu untuk menyiapkan wallets.json.");
    process.exit(1);
  }

  // 2. Buat Temporary Wallet Baru (100% Unlocked di Server Faucet)
  const req = new ethers.FetchRequest(config.RPC_URL);
  req.timeout = 30000;
  const net = new ethers.Network("qms-testnet", 19480);
  const provider = new ethers.JsonRpcProvider(req, net, { staticNetwork: net });

  const tempWallet = ethers.Wallet.createRandom().connect(provider);

  console.log(`  ${c.gray}Target Wallet Utama :${c.reset} ${c.bWhite}${mainTargetAddress}${c.reset}`);
  console.log(`  ${c.gray}Temporary Mining Addr:${c.reset} ${c.bYellow}${tempWallet.address}${c.reset}`);
  console.log(`  ${c.gray}Target Reward Faucet:${c.reset} ${c.bGreen}>= 1.05 QMS${c.reset}\n`);

  const initialMainBal = await provider.getBalance(mainTargetAddress);
  console.log(`  ${c.gray}Saldo Awal Wallet 1 :${c.reset} ${c.bCyan}${ethers.formatEther(initialMainBal)} QMS${c.reset}\n`);

  // 3. Inisialisasi Sesi Faucet via Camoufox (Turnstile Bypass)
  logger.info(`Membuat sesi faucet baru untuk ${tempWallet.address}...`);

  const startScript = path.join(FAUCET_DIR, "start_session.py");
  const sessionFile = path.join(FAUCET_DIR, "current_session.txt");

  let sessionObtained = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) {
      logger.info(`Mencoba ulang pembuatan sesi faucet (Percobaan ${attempt}/2)...`);
      await new Promise((r) => setTimeout(r, 5000));
    }

    if (fs.existsSync(sessionFile)) {
      try { fs.unlinkSync(sessionFile); } catch {}
    }

    const startChild = spawn("python", ["-u", startScript, tempWallet.address, sessionFile], {
      stdio: "inherit"
    });

    const startDone = await new Promise((resolve) => {
      startChild.on("close", (code) => {
        resolve(code === 0);
      });
    });

    if (startDone && fs.existsSync(sessionFile)) {
      sessionObtained = true;
      break;
    }
  }

  if (!sessionObtained || !fs.existsSync(sessionFile)) {
    logger.error("Gagal memulai sesi faucet baru.");
    return;
  }

  const sessionId = fs.readFileSync(sessionFile, "utf-8").trim();
  logger.success(`Sesi penambangan aktif didapat: ${sessionId}`);

  // 4. Jalankan Multi-Threaded WASM Argon2 Miner (~200 H/s)
  logger.info("Menjalankan High-Performance Miner Engine (6 Threads Argon2)...");
  const result = await runMinerEngine({
    sessionId,
    numWorkers: 6,
    targetReward: 1.05
  });

  logger.success(`Target tercapai! Klaim server berhasil: ${ethers.formatEther(result.balanceWei)} QMS`);
  if (result.txHash) {
    logger.info(`Server Faucet Tx: https://testnet.qmsscan.io/tx/${result.txHash}`);
  }

  console.log(`\n${c.bCyan}────────────────────────────────────────────────────────────────────${c.reset}`);
  logger.info("Memantau masuknya saldo hasil tambang di blockchain QMS Testnet...");

  let minedBalance = 0n;
  for (let i = 0; i < 40; i++) {
    try {
      const bal = await provider.getBalance(tempWallet.address);
      if (bal > 0n) {
        minedBalance = bal;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (minedBalance === 0n) {
    logger.warn("Saldo tambang belum muncul di temporary address dalam 80 detik.");
    const recoveryPath = path.join(FAUCET_DIR, ".last_temp_key.txt");
    try {
      fs.writeFileSync(recoveryPath, tempWallet.privateKey, { mode: 0o600 });
      logger.info(`Private key recovery sementara disimpan aman di: ${recoveryPath}`);
    } catch {}
    return;
  }

  logger.success(`🎉 Saldo faucet berhasil masuk on-chain: ${ethers.formatEther(minedBalance)} QMS!`);

  // 5. Relay / Transfer Langsung Seluruh Saldo ke Wallet Utama
  console.log(`\n${c.bGreen}┌─── Mentransfer Saldo ke Wallet Utama ──────────────────────────┐${c.reset}`);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || 100000000n;
  const gasLimit = 21000n;
  const fee = gasPrice * gasLimit;
  const sendAmount = minedBalance - fee;

  logger.info(`Mengirim ${c.bYellow}${ethers.formatEther(sendAmount)} QMS${c.reset} ke ${mainTargetAddress}...`);

  const tx = await tempWallet.sendTransaction({
    to: mainTargetAddress,
    value: sendAmount,
    gasLimit: gasLimit,
    gasPrice: gasPrice
  });

  logger.info(`Transaksi transfer terkirim! Hash: ${c.bCyan}${tx.hash}${c.reset}`);
  logger.info("Menunggu konfirmasi blok...");

  const receipt = await tx.wait(1);
  const newMainBal = await provider.getBalance(mainTargetAddress);

  console.log(`\n${c.bGreen}╔══════════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bGreen}║         🎉 KLAIM FAUCET & TRANSFER BERHASIL 100% DIKONFIRMASI!   ║${c.reset}`);
  console.log(`${c.bGreen}╚══════════════════════════════════════════════════════════════════╝${c.reset}`);
  console.log(`  ${c.gray}Explorer Tx    :${c.reset} ${c.bCyan}https://testnet.qmsscan.io/tx/${receipt.hash}${c.reset}`);
  console.log(`  ${c.gray}Blok Nomor     :${c.reset} ${receipt.blockNumber}`);
  console.log(`  ${c.gray}Saldo Baru W1  :${c.reset} ${c.bGreen}${ethers.formatEther(newMainBal)} QMS${c.reset} ${c.dim}(+${ethers.formatEther(sendAmount)} QMS)${c.reset}\n`);
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`);
});
