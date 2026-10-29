const fs = require("fs");
const path = require("path");
const config = require("../config");
const logger = require("../utils/logger");

const HISTORY_FILE = path.join(__dirname, "../../streak_history.json");

function getTodayUtcDate() {
  return new Date().toISOString().substring(0, 10); // YYYY-MM-DD
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    logger.warn(`Failed to read streak history: ${err.message}. Starting fresh.`);
    return {};
  }
}

function saveHistory(data) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    logger.error(`Failed to save streak history: ${err.message}`);
  }
}

function getWalletStats(address) {
  const history = loadHistory();
  const addrLower = address.toLowerCase();
  
  if (!history[addrLower]) {
    return {
      address: address,
      lastActiveDate: null,
      currentCycleDay: 0, // 0 to 7
      totalDaysCompleted: 0,
      totalQuantaPoints: 0,
      cyclesCompleted: 0,
      history: []
    };
  }

  return history[addrLower];
}

function hasCompletedToday(address) {
  const stats = getWalletStats(address);
  const today = getTodayUtcDate();
  return stats.lastActiveDate === today;
}

function recordCompletion(address, { swapTx, lpTx, swapAmount, lpEthAmount, lpUsdcAmount }) {
  const history = loadHistory();
  const addrLower = address.toLowerCase();
  const today = getTodayUtcDate();

  let stats = history[addrLower];
  if (!stats) {
    stats = {
      address: address,
      lastActiveDate: null,
      currentCycleDay: 0,
      totalDaysCompleted: 0,
      totalQuantaPoints: 0,
      cyclesCompleted: 0,
      history: []
    };
  }

  // Calculate points
  const pointsPerDay = config.IS_PIONEER_OR_QWABBIT 
    ? config.DAILY_POINTS_PIONEER 
    : config.DAILY_POINTS_STANDARD;
  const cycleBonus = config.IS_PIONEER_OR_QWABBIT 
    ? config.CYCLE_BONUS_PIONEER 
    : config.CYCLE_BONUS_STANDARD;

  let newCycleDay = (stats.currentCycleDay || 0) + 1;
  let bonusEarned = false;

  // Streak bonus on Day 6 of 7
  if (newCycleDay === 6) {
    bonusEarned = true;
    stats.totalQuantaPoints += (pointsPerDay + cycleBonus);
    logger.streak(`🎉 BONUS UNLOCKED! Completed 6 of 7 days! +${pointsPerDay} base + ${cycleBonus} bonus points!`);
  } else if (newCycleDay > 7) {
    // Reset cycle for next week
    newCycleDay = 1;
    stats.cyclesCompleted = (stats.cyclesCompleted || 0) + 1;
    stats.totalQuantaPoints += pointsPerDay;
  } else {
    stats.totalQuantaPoints += pointsPerDay;
  }

  stats.currentCycleDay = newCycleDay;
  stats.totalDaysCompleted += 1;
  stats.lastActiveDate = today;

  stats.history.push({
    date: today,
    timestamp: new Date().toISOString(),
    cycleDay: newCycleDay,
    pointsEarned: bonusEarned ? (pointsPerDay + cycleBonus) : pointsPerDay,
    bonusEarned,
    swapTx,
    lpTx,
    swapAmount,
    lpEthAmount,
    lpUsdcAmount
  });

  history[addrLower] = stats;
  saveHistory(history);

  const earned = bonusEarned ? (pointsPerDay + cycleBonus) : pointsPerDay;
  return {
    cycleDay: newCycleDay,
    totalPoints: stats.totalQuantaPoints,
    pointsEarned: earned,
    bonusEarned,
    today
  };
}

module.exports = {
  getTodayUtcDate,
  getWalletStats,
  hasCompletedToday,
  recordCompletion
};
