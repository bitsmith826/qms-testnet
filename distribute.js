const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const config = require("./src/config");
const logger = require("./src/utils/logger");
const { c, padText } = logger;

async function distribute() {
  logger.banner();

  const walletsPath = path.join(__dirname, "wallets.json");
  if (!fs.existsSync(walletsPath)) {
    logger.error("File wallets.json tidak ditemukan! Jalankan 'npm run setup' terlebih dahulu.");
    return;
  }

  const walletsData = JSON.parse(fs.readFileSync(walletsPath, "utf-8"));
  if (!Array.isArray(walletsData) || walletsData.length === 0) {
    logger.error("File wallets.json kosong!");
    return;
  }

  const provider = new ethers.JsonRpcProvider(config.RPC_URL);
  const mainAccountData = walletsData[0];
  const mainWallet = new ethers.Wallet(mainAccountData.privateKey, provider);

  const mainBal = await provider.getBalance(mainWallet.address);
  const mainBalEth = parseFloat(ethers.formatEther(mainBal));

  console.log(`${c.bCyan}┌─── Main Funder Wallet ───┐${c.reset}`);
  console.log(`  ${c.gray}Address :${c.reset} ${c.bWhite}${mainWallet.address}${c.reset}`);
  console.log(`  ${c.gray}Saldo   :${c.reset} ${c.bCyan}${mainBalEth.toFixed(4)} QMS${c.reset}`);
  console.log(`${c.bCyan}└──────────────────────────┘${c.reset}\n`);

  if (walletsData.length === 1) {
    logger.warn("Hanya ada 1 wallet di wallets.json. Tambahkan sub-wallet untuk mendistribusikan saldo.");
    return;
  }

  const args = process.argv.slice(2);
  const isForce = args.includes("--force") || args.includes("-f") || args.includes("--all");
  const amountIndex = args.indexOf("--amount");
  const requestedAmount = amountIndex !== -1 && args[amountIndex + 1] ? parseFloat(args[amountIndex + 1]) : 0.25;

  const transferAmount = ethers.parseEther(requestedAmount.toString());
  const minThreshold = ethers.parseEther("0.1");
  const gasReserve = ethers.parseEther("0.2"); // Simpan minimal 0.2 QMS untuk Main Wallet

  const subWalletsCount = walletsData.length - 1;
  const totalNeeded = transferAmount * BigInt(subWalletsCount);

  logger.info(`Memeriksa ${c.bYellow}${subWalletsCount} sub-wallet${c.reset} untuk pendanaan on-chain...`);
  if (isForce) {
    logger.info(`Mode Distribusi Penuh (${c.bCyan}--all / --force${c.reset}): Mentransfer ${c.bGreen}${requestedAmount} QMS${c.reset} ke setiap sub-wallet.\n`);
  } else {
    logger.info(`Ambang Batas Minimum: ${c.bCyan}0.1 QMS${c.reset} (Gunakan ${c.yellow}--force${c.reset} untuk transfer ke semua wallet tanpa syarat).\n`);
  }

  for (let i = 1; i < walletsData.length; i++) {
    const subData = walletsData[i];
    const subWallet = new ethers.Wallet(subData.privateKey, provider);
    const subBal = await provider.getBalance(subWallet.address);
    const subBalEth = parseFloat(ethers.formatEther(subBal));
    const displayName = subData.name || `Wallet ${i + 1}`;

    logger.cardStart(i, subWalletsCount, displayName, subWallet.address);
    logger.cardItem("Address", `${c.bold}${subWallet.address}${c.reset}`, "👤");
    logger.cardItem("Saldo Saat Ini", `${c.bCyan}${subBalEth.toFixed(4)} QMS${c.reset}`, "💰");

    const shouldTransfer = isForce || subBal < minThreshold;

    if (shouldTransfer) {
      const currentMainBal = await provider.getBalance(mainWallet.address);
      if (currentMainBal <= gasReserve + transferAmount) {
        logger.cardItem("Status", `${c.red}Sisa saldo Main Wallet menipis (< ${ethers.formatEther(gasReserve)} QMS). Distribusi dihentikan demi keamanan.${c.reset}`, "⚠️");
        logger.cardEnd();
        break;
      }

      logger.cardItem("Aksi", `${c.cyan}Mentransfer ${requestedAmount} QMS dari Main Wallet...${c.reset}`, "🚀");

      try {
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 120n) / 100n : 1000000000n;

        const tx = await mainWallet.sendTransaction({
          to: subWallet.address,
          value: transferAmount,
          gasLimit: 21000n,
          gasPrice: gasPrice
        });

        const shortTx = `${tx.hash.substring(0, 10)}...${tx.hash.substring(tx.hash.length - 8)}`;
        logger.cardItem("Broadcast", `${c.dim}${config.EXPLORER_URL}/tx/${tx.hash}${c.reset}`, "📡");

        await tx.wait(1);
        const newBal = await provider.getBalance(subWallet.address);
        const newBalEth = parseFloat(ethers.formatEther(newBal));
        logger.cardItem("Status", `${c.bGreen}✔ Transfer ${requestedAmount} QMS Sukses!${c.reset} ${c.dim}(Tx: ${shortTx})${c.reset}`, "✔");
        logger.cardItem("Saldo Baru", `${c.bYellow}${newBalEth.toFixed(4)} QMS${c.reset}`, "💳");
      } catch (err) {
        logger.cardItem("Status", `${c.red}Gagal transfer: ${err.message}${c.reset}`, "✖");
      }
    } else {
      logger.cardItem("Status", `${c.dim}Saldo sudah mencukupi (>= 0.1 QMS). Dilewati (Gunakan --force untuk kirim ulang).${c.reset}`, "✔");
    }

    logger.cardEnd();

    // Jeda 2 detik antar transfer agar nonce dan transaksi antri dengan rapi
    if (i < walletsData.length - 1 && shouldTransfer) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const finalMainBal = await provider.getBalance(mainWallet.address);
  const finalEth = parseFloat(ethers.formatEther(finalMainBal));

  const innerWidth = 68;
  const top = `${c.bGreen}╭${"─".repeat(innerWidth)}╮${c.reset}`;
  const mid = `${c.bGreen}├${"─".repeat(innerWidth)}┤${c.reset}`;
  const bot = `${c.bGreen}╰${"─".repeat(innerWidth)}╯${c.reset}`;

  const row = (str) => {
    const vlen = logger.visualLength(str);
    const pad = Math.max(0, innerWidth - vlen - 2);
    return `${c.bGreen}│${c.reset}  ${str}${" ".repeat(pad)}${c.bGreen}│${c.reset}`;
  };

  console.log(top);
  console.log(row(`${c.bWhite}${c.bold}DISTRIBUSI SALDO ON-CHAIN SELESAI${c.reset}`));
  console.log(mid);
  console.log(row(`${c.gray}Sisa Saldo Main Wallet :${c.reset} ${c.bYellow}${finalEth.toFixed(4)} QMS${c.reset}`));
  console.log(`${bot}\n`);
}

distribute().catch(err => {
  logger.error(`Distribusi gagal: ${err.message}`);
});
