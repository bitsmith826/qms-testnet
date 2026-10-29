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

  const transferAmount = ethers.parseEther("0.25");
  const minThreshold = ethers.parseEther("0.1");

  logger.info(`Memeriksa ${c.bYellow}${walletsData.length - 1} sub-wallet${c.reset} untuk pendanaan on-chain...\n`);

  for (let i = 1; i < walletsData.length; i++) {
    const subData = walletsData[i];
    const subWallet = new ethers.Wallet(subData.privateKey, provider);
    const subBal = await provider.getBalance(subWallet.address);
    const subBalEth = parseFloat(ethers.formatEther(subBal));
    const displayName = subData.name || `Wallet ${i + 1}`;

    logger.cardStart(i, walletsData.length - 1, displayName, subWallet.address);
    logger.cardItem("Address", `${c.bold}${subWallet.address}${c.reset}`, "👤");
    logger.cardItem("Saldo", `${c.bCyan}${subBalEth.toFixed(4)} QMS${c.reset}`, "💰");

    if (subBal < minThreshold) {
      logger.cardItem("Aksi", `${c.cyan}Mentransfer 0.25 QMS dari Main Wallet...${c.reset}`, "🚀");

      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || 1000000000n;

      const tx = await mainWallet.sendTransaction({
        to: subWallet.address,
        value: transferAmount,
        gasLimit: 21000n,
        gasPrice: gasPrice
      });

      const shortTx = `${tx.hash.substring(0, 10)}...${tx.hash.substring(tx.hash.length - 8)}`;
      logger.cardItem("Broadcast", `${c.dim}${config.EXPLORER_URL}/tx/${tx.hash}${c.reset}`, "📡");

      await tx.wait(1);
      logger.cardItem("Status", `${c.bGreen}✔ Transfer 0.25 QMS berhasil!${c.reset} ${c.dim}(Tx: ${shortTx})${c.reset}`, "✔");
    } else {
      logger.cardItem("Status", `${c.dim}Saldo sudah mencukupi (>= 0.1 QMS). Dilewati.${c.reset}`, "✔");
    }

    logger.cardEnd();
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
