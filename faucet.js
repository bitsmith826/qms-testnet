const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const logger = require("./src/utils/logger");
const { runMinerEngine } = require("./src/faucet/miner_engine");

const FAUCET_DIR = path.join(__dirname, "src", "faucet");

async function claimFaucet({ targetAddress, minReward = 1.05 }) {
  if (!targetAddress) {
    throw new Error("Target address is required for faucet claim.");
  }

  logger.info(`Memulai auto-claim faucet untuk: ${targetAddress}...`);

  const startScript = path.join(FAUCET_DIR, "start_session.py");
  const sessionFile = path.join(FAUCET_DIR, "current_session.txt");

  const startChild = spawn("python", ["-u", startScript, targetAddress, sessionFile], {
    stdio: "inherit"
  });

  const startDone = await new Promise((resolve) => {
    startChild.on("close", (code) => {
      resolve(code === 0);
    });
  });

  if (!startDone || !fs.existsSync(sessionFile)) {
    throw new Error("Gagal memulai sesi faucet via Turnstile solver.");
  }

  const sessionId = fs.readFileSync(sessionFile, "utf-8").trim();
  logger.success(`Sesi penambangan aktif didapat: ${sessionId}`);

  const result = await runMinerEngine({
    sessionId,
    numWorkers: 6,
    targetReward: minReward
  });

  return result;
}

module.exports = { claimFaucet };
