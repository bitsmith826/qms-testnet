const fs = require("fs");
const path = require("path");
const logger = require("./src/utils/logger");
const { c } = logger;

function runSetup() {
  logger.banner();

  console.log(`${c.bCyan}╭────────────────────────────────────────────────────────────────────╮${c.reset}`);
  console.log(`${c.bCyan}│${c.reset}  ${c.bYellow}🛠️  QMS & QWAP BOT - WIZARD PERSIAPAN CEPAT (EASY SETUP)${c.reset}          ${c.bCyan}│${c.reset}`);
  console.log(`${c.bCyan}╰────────────────────────────────────────────────────────────────────╯${c.reset}\n`);

  const envPath = path.join(__dirname, ".env");
  const envExamplePath = path.join(__dirname, ".env.example");
  const walletsPath = path.join(__dirname, "wallets.json");
  const walletsExamplePath = path.join(__dirname, "wallets.example.json");

  let createdEnv = false;
  let createdWallets = false;

  // 1. Setup .env
  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    createdEnv = true;
    logger.success("File .env berhasil dibuat dari .env.example");
  } else if (fs.existsSync(envPath)) {
    logger.info("File .env sudah ada (tidak ditimpa).");
  }

  // 2. Setup wallets.json
  if (!fs.existsSync(walletsPath) && fs.existsSync(walletsExamplePath)) {
    fs.copyFileSync(walletsExamplePath, walletsPath);
    createdWallets = true;
    logger.success("File wallets.json berhasil dibuat dari wallets.example.json");
  } else if (fs.existsSync(walletsPath)) {
    logger.info("File wallets.json sudah ada (tidak ditimpa).");
  }

  console.log(`\n${c.bGreen}┌─── 🎉 PERSIAPAN SELESAI! 3 LANGKAH MUDAH MEMULAI ──────────────┐${c.reset}`);
  console.log(`│                                                                  │`);
  console.log(`│  ${c.bWhite}1. Masukkan Private Key:${c.reset}                                        │`);
  console.log(`│     Buka file ${c.bCyan}wallets.json${c.reset} lalu tempel private key wallet Anda.       │`);
  console.log(`│                                                                  │`);
  console.log(`│  ${c.bWhite}2. Cek Saldo & Status:${c.reset}                                          │`);
  console.log(`│     Ketik: ${c.bYellow}npm run status${c.reset}                                         │`);
  console.log(`│                                                                  │`);
  console.log(`│  ${c.bWhite}3. Jalankan Auto Farming:${c.reset}                                       │`);
  console.log(`│     Ketik: ${c.bYellow}npm start${c.reset}                                              │`);
  console.log(`│                                                                  │`);
  console.log(`${c.bGreen}└──────────────────────────────────────────────────────────────────┘${c.reset}\n`);
}

runSetup();
