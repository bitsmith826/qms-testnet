const { ethers } = require("ethers");
const config = require("../config");
const { ROUTER_ABI, FACTORY_ABI, ERC20_ABI, PAIR_ABI } = require("../abi");
const logger = require("../utils/logger");

function getRandomBetween(min, max) {
  const val = min + Math.random() * (max - min);
  return parseFloat(val.toFixed(4));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBalances(provider, address) {
  let qmsBalanceWei = 0n;
  let qmsBalance = "0";
  try {
    qmsBalanceWei = await provider.getBalance(address);
    qmsBalance = ethers.formatEther(qmsBalanceWei);
  } catch (err) {
    logger.warn(`Failed to fetch native QMS balance: ${err.message}`);
  }

  const usdcContract = new ethers.Contract(config.USDC_ADDRESS, ERC20_ABI, provider);
  let usdcBalance = "0";
  try {
    const usdcBalanceWei = await usdcContract.balanceOf(address);
    usdcBalance = ethers.formatUnits(usdcBalanceWei, 6);
  } catch (err) {
    logger.warn(`Failed to fetch USDC balance: ${err.message}`);
  }

  return {
    qms: parseFloat(qmsBalance),
    qmsRaw: qmsBalanceWei,
    usdc: parseFloat(usdcBalance)
  };
}

async function executeDailySwap(wallet) {
  const provider = wallet.provider;
  const router = new ethers.Contract(config.ROUTER_ADDRESS, ROUTER_ABI, wallet);

  // 1. Pick a randomized swap amount
  const swapAmountEth = getRandomBetween(config.MIN_SWAP_AMOUNT, config.MAX_SWAP_AMOUNT);
  const swapAmountWei = ethers.parseEther(swapAmountEth.toString());

  logger.info(`Initiating Swap: ${swapAmountEth} QMS -> USDC...`);

  // 2. Query expected output
  const path = [config.WQMS_ADDRESS, config.USDC_ADDRESS];
  let expectedOutWei;
  try {
    const amounts = await router.getAmountsOut(swapAmountWei, path);
    expectedOutWei = amounts[1];
  } catch (err) {
    throw new Error(`Failed to query router getAmountsOut: ${err.message}`);
  }

  // Calculate slippage min output
  // amountOutMin = expected * (10000 - slippageBps) / 10000
  const minOutWei = (expectedOutWei * BigInt(10000 - config.SLIPPAGE_BPS)) / 10000n;
  const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 mins

  logger.info(`Quote: ~${ethers.formatUnits(expectedOutWei, 6)} USDC (Min with ${config.SLIPPAGE_BPS / 100}% slippage: ${ethers.formatUnits(minOutWei, 6)} USDC)`);

  // 3. Send transaction with gasLimit safety buffer to prevent out-of-gas reverts
  const tx = await router.swapExactETHForTokens(
    minOutWei,
    path,
    wallet.address,
    deadline,
    {
      value: swapAmountWei,
      gasLimit: 250000n
    }
  );

  logger.info(`Swap Tx Broadcast: ${config.EXPLORER_URL}/tx/${tx.hash}`);
  const receipt = await tx.wait();

  if (receipt.status !== 1) {
    throw new Error(`Swap transaction reverted on-chain. Tx: ${tx.hash}`);
  }

  logger.success(`Swap confirmed in block ${receipt.blockNumber}!`);
  return {
    txHash: tx.hash,
    swapAmount: swapAmountEth,
    expectedUsdc: ethers.formatUnits(expectedOutWei, 6)
  };
}

async function executeDailyAddLP(wallet) {
  const provider = wallet.provider;
  const router = new ethers.Contract(config.ROUTER_ADDRESS, ROUTER_ABI, wallet);
  const factory = new ethers.Contract(config.FACTORY_ADDRESS, FACTORY_ABI, provider);
  const usdc = new ethers.Contract(config.USDC_ADDRESS, ERC20_ABI, wallet);

  // 1. Check pair reserves to find ratio
  const pairAddress = await factory.getPair(config.WQMS_ADDRESS, config.USDC_ADDRESS);
  if (!pairAddress || pairAddress === ethers.ZeroAddress) {
    throw new Error("WQMS-USDC pair does not exist on factory!");
  }

  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const [reserve0, reserve1] = await pair.getReserves();
  const token0 = await pair.token0();

  // Determine which reserve is WQMS and USDC
  const isWqms0 = token0.toLowerCase() === config.WQMS_ADDRESS.toLowerCase();
  const reserveWqms = isWqms0 ? reserve0 : reserve1;
  const reserveUsdc = isWqms0 ? reserve1 : reserve0;

  // 2. Determine LP amounts
  // Desired QMS to provide
  const lpEth = getRandomBetween(config.MIN_LP_ETH_AMOUNT, config.MAX_LP_ETH_AMOUNT);
  let lpEthWei = ethers.parseEther(lpEth.toString());

  // Optimal USDC = (lpEthWei * reserveUsdc) / reserveWqms
  let desiredUsdcWei = (lpEthWei * reserveUsdc) / reserveWqms;

  // Check wallet USDC balance
  const currentUsdcWei = await usdc.balanceOf(wallet.address);
  if (currentUsdcWei === 0n) {
    throw new Error("No USDC available in wallet to provide liquidity. Please swap first.");
  }

  // If desired USDC exceeds wallet balance, adjust both to use 85% of available USDC
  if (desiredUsdcWei > currentUsdcWei) {
    desiredUsdcWei = (currentUsdcWei * 85n) / 100n;
    lpEthWei = (desiredUsdcWei * reserveWqms) / reserveUsdc;
  }

  const finalLpEth = parseFloat(ethers.formatEther(lpEthWei));
  const desiredUsdc = parseFloat(ethers.formatUnits(desiredUsdcWei, 6));

  logger.info(`Providing Liquidity: ${finalLpEth.toFixed(4)} QMS + ~${desiredUsdc.toFixed(4)} USDC...`);

  // 3. Check and grant allowance if necessary
  const currentAllowance = await usdc.allowance(wallet.address, config.ROUTER_ADDRESS);
  if (currentAllowance < desiredUsdcWei) {
    logger.info(`Approving USDC allowance for Router...`);
    const approveTx = await usdc.approve(config.ROUTER_ADDRESS, ethers.MaxUint256, { gasLimit: 100000n });
    logger.info(`Approval Tx: ${config.EXPLORER_URL}/tx/${approveTx.hash}`);
    await approveTx.wait();
    logger.success(`USDC Approved successfully!`);
    await sleep(2000);
  }

  // 4. Calculate min amounts with 10% slippage tolerance to guarantee inclusion in busy blocks
  const minEthWei = (lpEthWei * 9000n) / 10000n;
  const minUsdcWei = (desiredUsdcWei * 9000n) / 10000n;
  const deadline = Math.floor(Date.now() / 1000) + 1200;

  // 5. Add liquidity with gasLimit safety buffer
  const tx = await router.addLiquidityETH(
    config.USDC_ADDRESS,
    desiredUsdcWei,
    minUsdcWei,
    minEthWei,
    wallet.address,
    deadline,
    {
      value: lpEthWei,
      gasLimit: 350000n
    }
  );

  logger.info(`Add LP Tx Broadcast: ${config.EXPLORER_URL}/tx/${tx.hash}`);
  const receipt = await tx.wait();

  if (receipt.status !== 1) {
    throw new Error(`Add LP transaction reverted on-chain. Tx: ${tx.hash}`);
  }

  logger.success(`Liquidity added successfully in block ${receipt.blockNumber}!`);
  return {
    txHash: tx.hash,
    lpEthAmount: lpEth,
    lpUsdcAmount: desiredUsdc
  };
}

module.exports = {
  getBalances,
  executeDailySwap,
  executeDailyAddLP,
  getRandomBetween,
  sleep
};
