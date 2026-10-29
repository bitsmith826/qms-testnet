require("dotenv").config();

module.exports = {
  // QMS Testnet Chain Details
  RPC_URL: process.env.RPC_URL || "https://rpc.testnet.qms.finance",
  CHAIN_ID: parseInt(process.env.CHAIN_ID || "19480", 10),
  EXPLORER_URL: process.env.EXPLORER_URL || "https://testnet.qmsscan.io",
  FAUCET_URL: "https://faucet.testnet.qms.finance",

  // DEX Contracts on QMS Testnet
  FACTORY_ADDRESS: process.env.FACTORY_ADDRESS || "0x93AFD9aC50822F82c7C4f2Ec8Ec2463b086Fb878",
  ROUTER_ADDRESS: process.env.ROUTER_ADDRESS || "0x93AFF45f28e5DF1b55f5AEFEfB807De843b12619",
  WQMS_ADDRESS: process.env.WQMS_ADDRESS || "0x9AA510295aC664A3d5A3182a3eFe959DE2B12c34",
  USDC_ADDRESS: process.env.USDC_ADDRESS || "0xDfF68E53a0A8275212927c12017f5aB5f1842a04",

  // Trading & LP Settings
  // Amounts are in native QMS (ETH equivalent)
  MIN_SWAP_AMOUNT: parseFloat(process.env.MIN_SWAP_AMOUNT || "0.005"),
  MAX_SWAP_AMOUNT: parseFloat(process.env.MAX_SWAP_AMOUNT || "0.015"),
  MIN_LP_ETH_AMOUNT: parseFloat(process.env.MIN_LP_ETH_AMOUNT || "0.005"),
  MAX_LP_ETH_AMOUNT: parseFloat(process.env.MAX_LP_ETH_AMOUNT || "0.010"),
  
  // Slippage in Basis Points (500 = 5%, 1000 = 10%)
  SLIPPAGE_BPS: parseInt(process.env.SLIPPAGE_BPS || "500", 10),
  
  // Anti-Sybil / Random delays (in seconds)
  MIN_DELAY_BETWEEN_WALLETS_SEC: parseInt(process.env.MIN_DELAY_BETWEEN_WALLETS_SEC || "15", 10),
  MAX_DELAY_BETWEEN_WALLETS_SEC: parseInt(process.env.MAX_DELAY_BETWEEN_WALLETS_SEC || "45", 10),
  DELAY_BETWEEN_ACTIONS_SEC: parseInt(process.env.DELAY_BETWEEN_ACTIONS_SEC || "8", 10),

  // Quanta Points Settings
  // Standard user earns 8 pts/day, Pioneer/Qwabbit earns 10 pts/day
  IS_PIONEER_OR_QWABBIT: process.env.IS_PIONEER_OR_QWABBIT === "true",
  DAILY_POINTS_STANDARD: 8,
  DAILY_POINTS_PIONEER: 10,
  CYCLE_BONUS_STANDARD: 22, // 8 * 6 = 48 + 22 bonus = 70 points
  CYCLE_BONUS_PIONEER: 28,  // 10 * 6 = 60 + 28 bonus = 88 points

  // Cron schedule for automatic daily execution (default: 00:15 UTC every day)
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || "15 0 * * *"
};
