const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const logger = require("../utils/logger");

function maskKey(key) {
  if (!key || key.length < 10) return "******";
  return key.substring(0, 6) + "..." + key.substring(key.length - 4);
}

function loadWallets(provider) {
  const wallets = [];
  const seenAddresses = new Set();

  function addKey(pk, label = "") {
    let cleanKey = pk.trim();
    if (!cleanKey) return;
    if (!cleanKey.startsWith("0x")) {
      cleanKey = "0x" + cleanKey;
    }
    try {
      const wallet = new ethers.Wallet(cleanKey, provider);
      const addrLower = wallet.address.toLowerCase();
      if (!seenAddresses.has(addrLower)) {
        seenAddresses.add(addrLower);
        wallets.push({
          wallet,
          address: wallet.address,
          name: label || `Wallet ${wallets.length + 1}`,
          maskedKey: maskKey(cleanKey)
        });
      }
    } catch (err) {
      logger.error(`Invalid private key skipped: ${maskKey(cleanKey)} (${err.message})`);
    }
  }

  // 1. Check wallets.json
  const walletsJsonPath = path.join(__dirname, "../../wallets.json");
  if (fs.existsSync(walletsJsonPath)) {
    try {
      const content = fs.readFileSync(walletsJsonPath, "utf-8");
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        list.forEach((item, idx) => {
          if (typeof item === "string") {
            addKey(item, `Wallet ${idx + 1}`);
          } else if (item && item.privateKey) {
            addKey(item.privateKey, item.name || `Wallet ${idx + 1}`);
          }
        });
      }
    } catch (err) {
      logger.warn(`Could not parse wallets.json: ${err.message}`);
    }
  }

  // 2. Check wallets.txt
  const walletsTxtPath = path.join(__dirname, "../../wallets.txt");
  if (fs.existsSync(walletsTxtPath)) {
    try {
      const lines = fs.readFileSync(walletsTxtPath, "utf-8").split("\n");
      lines.forEach((line, idx) => {
        const clean = line.trim();
        if (clean && !clean.startsWith("#")) {
          addKey(clean, `Wallet ${wallets.length + 1}`);
        }
      });
    } catch (err) {
      logger.warn(`Could not parse wallets.txt: ${err.message}`);
    }
  }

  // 3. Check .env PRIVATE_KEY / PRIVATE_KEYS
  if (process.env.PRIVATE_KEY) {
    addKey(process.env.PRIVATE_KEY, "Primary Wallet");
  }
  if (process.env.PRIVATE_KEYS) {
    const keys = process.env.PRIVATE_KEYS.split(",");
    keys.forEach((k, idx) => addKey(k, `Env Wallet ${idx + 1}`));
  }

  return wallets;
}

function generateWallet() {
  const randomWallet = ethers.Wallet.createRandom();
  return {
    address: randomWallet.address,
    privateKey: randomWallet.privateKey,
    mnemonic: randomWallet.mnemonic?.phrase
  };
}

module.exports = {
  loadWallets,
  generateWallet,
  maskKey
};
