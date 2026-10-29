const { ethers } = require("ethers");
const cron = require("node-cron");
const config = require("./src/config");
const logger = require("./src/utils/logger");
const { c, padText } = logger;
const { loadWallets, generateWallet } = require("./src/services/walletManager");
const { getWalletStats, hasCompletedToday, recordCompletion } = require("./src/services/streakTracker");
const { getBalances, executeDailySwap, executeDailyAddLP, getRandomBetween, sleep } = require("./src/services/dexService");
const { claimFaucet } = require("./faucet");

async function runForWallet(walletInfo, force = false, autoFaucet = false, index = 1, totalWallets = 1, attempt = 1, maxRetries = 1) {
  const { wallet, address, name, maskedKey } = walletInfo;
  const stats = getWalletStats(address);
  const alreadyDone = hasCompletedToday(address);

  const attemptTag = maxRetries > 1 && attempt > 1 ? ` (Retry ${attempt}/${maxRetries})` : "";
  logger.cardStart(index, totalWallets, name + attemptTag, address, maskedKey);
  logger.cardItem("Address", `${c.bold}${address}${c.reset}`, "👤");

  let balances = { qms: 0, qmsRaw: 0n, usdc: 0 };

  try {
    // 1. Cek saldo akun
    balances = await getBalances(wallet.provider, address);
    logger.cardItem("Saldo", `${c.bCyan}${balances.qms.toFixed(4)} QMS${c.reset} ${c.dim}|${c.reset} ${c.white}${balances.usdc.toFixed(4)} USDC${c.reset}`, "💰");
    logger.cardItem("Streak", `${c.bMagenta}Day ${stats.currentCycleDay}/7${c.reset} ${c.dim}(Total: ${stats.totalDaysCompleted} hari | ${stats.totalQuantaPoints} pts)${c.reset}`, "🔥");

    // Jika sudah selesai hari ini dan tidak diforce
    if (alreadyDone && !force) {
      logger.cardItem("Status", `${c.tagDone} ${c.dim}Tugas hari ini (${stats.lastActiveDate}) sudah selesai. Dilewati.${c.reset}`, "✔");
      logger.cardEnd();
      return { success: true, skipped: true, stats, balances };
    }

    const minRequiredQms = config.MAX_SWAP_AMOUNT + config.MAX_LP_ETH_AMOUNT + 0.005;
    if (balances.qms < minRequiredQms) {
      if (autoFaucet) {
        logger.cardItem("Faucet", `${c.yellow}Saldo kurang (${balances.qms.toFixed(4)} QMS). Menjalankan auto-faucet...${c.reset}`, "🚰");
        try {
          await claimFaucet({ targetAddress: address, minReward: 2.0 });
          balances = await getBalances(wallet.provider, address);
          logger.cardItem("Saldo Baru", `${c.bCyan}${balances.qms.toFixed(4)} QMS${c.reset}`, "💰");
        } catch (faucetErr) {
          logger.cardItem("Faucet Err", `${c.bRed}${faucetErr.message}${c.reset}`, "✖");
        }
      }

      if (balances.qms < minRequiredQms) {
        logger.cardItem("Status", `${c.tagError} ${c.bRed}Saldo QMS tidak cukup (${balances.qms.toFixed(4)} QMS). Min: ${minRequiredQms.toFixed(4)} QMS.${c.reset}`, "✖");
        logger.cardEnd();
        return { success: false, reason: "Insufficient balance", stats, balances };
      }
    }

    // 2. Eksekusi Swap (QMS -> USDC)
    logger.cardItem("Swap", `${c.cyan}Menukar native QMS -> USDC di DEX QWAP...${c.reset}`, "🔄");
    const swapResult = await executeDailySwap(wallet);
    const shortSwapTx = `${swapResult.txHash.substring(0, 10)}...${swapResult.txHash.substring(swapResult.txHash.length - 8)}`;
    logger.cardItem("Swap Sukses", `${c.bGreen}+${parseFloat(swapResult.expectedUsdc).toFixed(4)} USDC${c.reset} ${c.dim}(Tx: ${shortSwapTx})${c.reset}`, "✔");

    // Jeda antar aksi
    logger.cardItem("Delay", `${c.dim}Menunggu jeda ${config.DELAY_BETWEEN_ACTIONS_SEC} detik sebelum add liquidity...${c.reset}`, "⏳");
    await sleep(config.DELAY_BETWEEN_ACTIONS_SEC * 1000);

    // 3. Eksekusi Add Liquidity (QMS + USDC -> LP)
    logger.cardItem("Add LP", `${c.cyan}Menyediakan likuiditas ke pool WQMS-USDC...${c.reset}`, "💧");
    const lpResult = await executeDailyAddLP(wallet);
    const shortLpTx = `${lpResult.txHash.substring(0, 10)}...${lpResult.txHash.substring(lpResult.txHash.length - 8)}`;
    logger.cardItem("LP Sukses", `${c.bGreen}+${lpResult.lpEthAmount.toFixed(4)} QMS & ~${lpResult.lpUsdcAmount.toFixed(4)} USDC${c.reset} ${c.dim}(Tx: ${shortLpTx})${c.reset}`, "✔");

    // 4. Catat streak & perolehan poin
    const streakResult = recordCompletion(address, {
      swapTx: swapResult.txHash,
      lpTx: lpResult.txHash,
      swapAmount: swapResult.swapAmount,
      lpEthAmount: lpResult.lpEthAmount,
      lpUsdcAmount: lpResult.lpUsdcAmount
    });

    const bonusTxt = streakResult.bonusEarned ? ` ${c.bYellow}🌟 BONUS 6-OF-7 UNLOCKED (+${config.CYCLE_BONUS_STANDARD} pts)!${c.reset}` : "";
    logger.cardItem("Hasil", `${c.bGreen}${c.bold}🎉 Tugas Harian Selesai!${c.reset} Streak: ${c.bMagenta}Day ${streakResult.cycleDay}/7${c.reset} | Quanta: ${c.bYellow}+${streakResult.pointsEarned} Pts${c.reset}${bonusTxt}`, "🏆");
    logger.cardEnd();

    return {
      success: true,
      skipped: false,
      swapTx: swapResult.txHash,
      lpTx: lpResult.txHash,
      streakResult,
      balances
    };
  } catch (err) {
    logger.cardItem("Status", `${c.tagError} ${c.bRed}${err.message}${c.reset}`, "✖");
    logger.cardEnd();
    return { success: false, error: err.message, stats, balances };
  }
}

async function runWalletWithRetry(walletInfo, force = false, autoFaucet = false, index = 1, totalWallets = 1, maxRetries = 2) {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    const res = await runForWallet(walletInfo, force, autoFaucet, index, totalWallets, attempt, maxRetries);
    if (res.success || res.skipped) {
      return res;
    }

    if (attempt < maxRetries) {
      console.log(`  ${c.bYellow}⚠️  [${walletInfo.name}] Percobaan #${attempt} gagal: ${res.error || res.reason}.${c.reset}`);
      console.log(`  ${c.cyan}🔄 Mencoba ulang dalam 6 detik... (Percobaan ${attempt + 1}/${maxRetries})${c.reset}\n`);
      await sleep(6000);
    } else {
      return res;
    }
  }
}

function createProvider() {
  const req = new ethers.FetchRequest(config.RPC_URL);
  req.timeout = 60000;
  const net = new ethers.Network("qms-testnet", config.CHAIN_ID);
  return new ethers.JsonRpcProvider(req, net, { staticNetwork: net });
}

function showNoWalletsNotice() {
  console.log(`\n${c.bYellow}┌─── ⚠️  BELUM ADA WALLET TERDAFTAR ───────────────────────────────┐${c.reset}`);
  console.log(`│                                                                  │`);
  console.log(`│  Bot tidak menemukan daftar wallet di ${c.bCyan}wallets.json${c.reset}.                  │`);
  console.log(`│                                                                  │`);
  console.log(`│  ${c.bWhite}Langkah Cepat Memulai:${c.reset}                                          │`);
  console.log(`│  1. Jalankan wizard persiapan otomatis:                          │`);
  console.log(`│     ${c.bGreen}npm run setup${c.reset}                                                │`);
  console.log(`│  2. Buka file ${c.bCyan}wallets.json${c.reset} dan masukkan private key Anda:             │`);
  console.log(`│     ${c.yellow}"privateKey": "0x..."${c.reset}                                         │`);
  console.log(`│  3. Cek status & saldo:                                          │`);
  console.log(`│     ${c.bGreen}npm run status${c.reset}                                               │`);
  console.log(`│  4. Mulai farming:                                               │`);
  console.log(`│     ${c.bGreen}npm start${c.reset}                                                    │`);
  console.log(`│                                                                  │`);
  console.log(`${c.bYellow}└──────────────────────────────────────────────────────────────────┘${c.reset}\n`);
}

async function runAll(force = false, autoFaucet = false) {
  logger.banner();
  const provider = createProvider();

  try {
    const network = await provider.getNetwork();
    logger.info(`Terhubung ke jaringan: Chain ID ${c.bCyan}${network.chainId.toString()}${c.reset} (Expected: ${config.CHAIN_ID})`);
  } catch (err) {
    logger.error(`Tidak dapat terhubung ke RPC QMS di ${config.RPC_URL}: ${err.message}`);
    return;
  }

  const wallets = loadWallets(provider);
  if (wallets.length === 0) {
    showNoWalletsNotice();
    return;
  }

  logger.info(`Memproses ${c.bYellow}${wallets.length} wallet${c.reset} secara berurutan dengan anti-sybil jitter...\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    try {
      const res = await runWalletWithRetry(w, force, autoFaucet, i + 1, wallets.length, 2);

      if (res && res.success) {
        if (res.skipped) skipCount++;
        else successCount++;
      } else {
        errorCount++;
      }

      // Jeda anti-sybil antar wallet (hanya jika transaksi dieksekusi)
      if (i < wallets.length - 1) {
        if (res && res.skipped) {
          await sleep(1000);
        } else {
          const delay = Math.floor(getRandomBetween(config.MIN_DELAY_BETWEEN_WALLETS_SEC, config.MAX_DELAY_BETWEEN_WALLETS_SEC));
          console.log(`  ${c.gray}⏳ Anti-sybil jitter: Menunggu jeda ${c.bYellow}${delay}s${c.reset} ${c.gray}sebelum wallet berikutnya...${c.reset}\n`);
          await sleep(delay * 1000);
        }
      }
    } catch (unexpectedLoopErr) {
      errorCount++;
      logger.error(`Error tak terduga pada ${w.name}: ${unexpectedLoopErr.message}. Tetap melanjutkan ke wallet berikutnya...`);
      await sleep(2000);
    }
  }

  // Tampilkan tabel status akhir secara presisi
  await showStatus(false);
}

async function showStatus(showBanner = true) {
  if (showBanner) logger.banner();
  const provider = createProvider();
  const wallets = loadWallets(provider);

  if (wallets.length === 0) {
    showNoWalletsNotice();
    return;
  }

  logger.info(`Mengambil status on-chain dan progres streak untuk ${c.bYellow}${wallets.length} wallet${c.reset}...`);

  const cols = [
    { header: "No", width: 4, align: "center" },
    { header: "Nama Wallet", width: 17, align: "left" },
    { header: "Address", width: 14, align: "center" },
    { header: "Saldo QMS", width: 13, align: "right" },
    { header: "Saldo USDC", width: 13, align: "right" },
    { header: "Streak", width: 9, align: "center" },
    { header: "Poin", width: 8, align: "right" },
    { header: "Status Hari Ini", width: 15, align: "center" }
  ];

  const rows = [];
  let completedToday = 0;
  let pendingToday = 0;
  let totalPoints = 0;

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    try {
      const stats = getWalletStats(w.address);
      const balances = await getBalances(provider, w.address);
      const isDone = hasCompletedToday(w.address);

      if (isDone) completedToday++;
      else pendingToday++;
      totalPoints += stats.totalQuantaPoints;

      const shortAddr = `${w.address.substring(0, 6)}...${w.address.substring(w.address.length - 4)}`;
      const statusBadge = isDone
        ? `${c.bGreen}✔ SELESAI${c.reset}`
        : `${c.bYellow}⏳ PENDING${c.reset}`;

      rows.push([
        `${c.bold}#${i + 1}${c.reset}`,
        `${c.bWhite}${w.name}${c.reset}`,
        `${c.dim}${shortAddr}${c.reset}`,
        `${c.bCyan}${balances.qms.toFixed(4)} QMS${c.reset}`,
        `${c.white}${balances.usdc.toFixed(4)} USDC${c.reset}`,
        `${c.bMagenta}Day ${stats.currentCycleDay}/7${c.reset}`,
        `${c.bYellow}${stats.totalQuantaPoints} pts${c.reset}`,
        statusBadge
      ]);
    } catch (err) {
      rows.push([
        `#${i + 1}`,
        w.name,
        w.address.substring(0, 10),
        "-",
        "-",
        "-",
        "-",
        `${c.bRed}✖ ERROR${c.reset}`
      ]);
    }
  }

  const tableInnerWidth = 114;
  console.log(`\n${c.bCyan}╔${"═".repeat(tableInnerWidth)}╗`);
  console.log(`║${padText("✦  TABEL STATUS & PROGRESS 10 WALLET QWAP  ✦", tableInnerWidth, "center")}║`);
  console.log(`╚${"═".repeat(tableInnerWidth)}╝${c.reset}`);

  logger.renderTable(cols, rows);
  console.log("");

  logger.summaryBox(completedToday, 0, pendingToday, { totalPoints });
}

function startDaemon(autoFaucet = false) {
  logger.banner();
  logger.info(`Memulai bot dalam ${c.bCyan}MODE DAEMON (24/7)${c.reset}.`);
  logger.info(`Jadwal Cron : ${c.bYellow}"${config.CRON_SCHEDULE}"${c.reset} (Eksekusi harian otomatis 00:15 UTC / 07:15 WIB)`);

  logger.info("Menjalankan pengecekan perdana sekarang...");
  runAll(false, autoFaucet).catch(err => logger.error(`Error pada cek perdana: ${err.message}`));

  cron.schedule(config.CRON_SCHEDULE, () => {
    logger.streak(`⏰ Cron Trigger: Memulai eksekusi harian otomatis seluruh wallet!`);
    runAll(false, autoFaucet).catch(err => logger.error(`Error pada cron run: ${err.message}`));
  });

  logger.info("Daemon aktif dan memantau jadwal. Tekan Ctrl+C untuk berhenti.");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
${c.bWhite}${c.bold}Panduan Penggunaan:${c.reset}
  node index.js [opsi]

${c.bWhite}${c.bold}Opsi Perintah:${c.reset}
  ${c.bCyan}--run, -r${c.reset}             Jalankan rutinitas swap & LP untuk semua wallet sekarang (default)
  ${c.bCyan}--status, -s${c.reset}          Tampilkan tabel status, saldo, streak, dan perolehan poin
  ${c.bCyan}--force, -f${c.reset}           Paksa eksekusi meskipun wallet sudah selesai hari ini
  ${c.bCyan}--daemon, -d${c.reset}          Jalankan 24/7 di background sesuai jadwal cron
  ${c.bCyan}--faucet${c.reset}              Klaim faucet otomatis jika saldo QMS belum mencukupi
  ${c.bCyan}--generate-wallet, -g${c.reset} Buat wallet EVM baru untuk pengujian
  ${c.bCyan}--help, -h${c.reset}            Tampilkan pesan bantuan ini
    `);
    return;
  }

  if (args.includes("--generate-wallet") || args.includes("-g")) {
    const w = generateWallet();
    console.log(`\n${c.bCyan}┌─── Wallet EVM Baru ───┐${c.reset}`);
    console.log(`  ${c.gray}Address    :${c.reset} ${c.bWhite}${w.address}${c.reset}`);
    console.log(`  ${c.gray}Private Key:${c.reset} ${c.bYellow}${w.privateKey}${c.reset}`);
    if (w.mnemonic) {
      console.log(`  ${c.gray}Mnemonic   :${c.reset} ${c.dim}${w.mnemonic}${c.reset}`);
    }
    console.log(`  ${c.gray}Faucet URL :${c.reset} ${c.bBlue}${config.FAUCET_URL}${c.reset}`);
    console.log(`${c.bCyan}└───────────────────────┘${c.reset}\n`);
    return;
  }

  if (args.includes("--status") || args.includes("-s")) {
    await showStatus(true);
    return;
  }

  const autoFaucet = args.includes("--faucet");

  if (args.includes("--daemon") || args.includes("-d")) {
    startDaemon(autoFaucet);
    return;
  }

  const force = args.includes("--force") || args.includes("-f");
  await runAll(force, autoFaucet);
}

main().catch(err => {
  logger.error(`Fatal Exception: ${err.message}`);
  process.exit(1);
});
