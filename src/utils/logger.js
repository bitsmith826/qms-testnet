/**
 * logger.js: Utilitas output konsol dengan styling presisi ANSI, box-drawing Unicode,
 * perataan visual bebas distorsi escape code, dan kartu left-rail modern.
 * Sesuai gaya standar antarmuka konsol modern.
 */

// ============================================================================
// ANSI Color Palette & Badges
// ============================================================================
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  underline: "\x1b[4m",

  // Regular Foreground
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Bright Foreground
  bRed: "\x1b[91m",
  bGreen: "\x1b[92m",
  bYellow: "\x1b[93m",
  bBlue: "\x1b[94m",
  bMagenta: "\x1b[95m",
  bCyan: "\x1b[96m",
  bWhite: "\x1b[97m",

  // Badges (Background + Foreground + Bold)
  tagInfo:    "\x1b[44m\x1b[97m\x1b[1m  INFO   \x1b[0m",
  tagSuccess: "\x1b[42m\x1b[30m\x1b[1m SELESAI \x1b[0m",
  tagDone:    "\x1b[42m\x1b[97m\x1b[1m ✔ SUKSES \x1b[0m",
  tagPending: "\x1b[43m\x1b[30m\x1b[1m ⏳ SKIP  \x1b[0m",
  tagWarn:    "\x1b[43m\x1b[30m\x1b[1m  WARN   \x1b[0m",
  tagError:   "\x1b[41m\x1b[97m\x1b[1m  ERROR  \x1b[0m",
  tagStreak:  "\x1b[45m\x1b[97m\x1b[1m 🔥 STREAK \x1b[0m"
};

const LINE_WIDTH = 68;
const DIVIDER_BOLD = `${c.bCyan}${"━".repeat(LINE_WIDTH)}${c.reset}`;
const DIVIDER_THIN = `${c.gray}${"─".repeat(LINE_WIDTH)}${c.reset}`;

// ============================================================================
// Visual Width & Text Alignment Helpers
// ============================================================================

/**
 * Menghapus kode ANSI escape sequence untuk menghitung panjang visual teks
 */
function stripAnsi(str) {
  return String(str ?? "").replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Menghitung lebar visual karakter (sesuai standard terminal East Asian Width & Emoji)
 */
function charWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0x200D || (cp >= 0x0300 && cp <= 0x036F) || (cp >= 0xFE00 && cp <= 0xFE0F)) return 0;
  // Wide symbols (including ⚡, ⏳, etc.)
  if (cp === 0x26A1 || cp === 0x23F3 || cp === 0x231A || cp === 0x231B) return 2;
  // Surrogate pairs / Emoji above U+1F000
  if (cp >= 0x1F000 && cp <= 0x1FAFF) return 2;
  // CJK & Fullwidth
  if (
    (cp >= 0x1100 && cp <= 0x115F) ||
    (cp >= 0x2E80 && cp <= 0xA4CF) ||
    (cp >= 0xAC00 && cp <= 0xD7A3) ||
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    (cp >= 0xFE30 && cp <= 0xFE6F) ||
    (cp >= 0xFF00 && cp <= 0xFF60) ||
    (cp >= 0xFFE0 && cp <= 0xFFE6)
  ) {
    return 2;
  }
  return 1;
}

/**
 * Menghitung panjang visual string sebenarnya di layar terminal
 */
function visualLength(str) {
  const plain = stripAnsi(str);
  let len = 0;
  for (const ch of plain) {
    len += charWidth(ch);
  }
  return len;
}

/**
 * Perataan teks presisi (left, right, center)
 */
function padText(text, width, align = "left") {
  const visible = visualLength(text);
  const diff = width - visible;
  if (diff <= 0) return text;
  if (align === "right") return " ".repeat(diff) + text;
  if (align === "center") {
    const left = Math.floor(diff / 2);
    const right = diff - left;
    return " ".repeat(left) + text + " ".repeat(right);
  }
  return text + " ".repeat(diff);
}

/**
 * Format timestamp lokal [HH.MM.SS]
 */
function getTimestamp() {
  const time = new Date().toLocaleTimeString("id-ID", { hour12: false });
  return `${c.gray}[${time}]${c.reset}`;
}

// ============================================================================
// Unicode Table & Progress Bar Rendering
// ============================================================================

/**
 * Merender tabel dengan border box Unicode presisi dan perataan kolom sempurna
 */
function renderTable(cols, rows) {
  const top = `${c.bCyan}┌─` + cols.map(col => "─".repeat(col.width)).join("─┬─") + `─┐${c.reset}`;
  const mid = `${c.bCyan}├─` + cols.map(col => "─".repeat(col.width)).join("─┼─") + `─┤${c.reset}`;
  const bot = `${c.bCyan}└─` + cols.map(col => "─".repeat(col.width)).join("─┴─") + `─┘${c.reset}`;

  console.log(top);
  console.log(`${c.bCyan}│${c.reset} ` + cols.map(col => `${c.bold}` + padText(col.header, col.width, "center") + `${c.reset}`).join(` ${c.bCyan}│${c.reset} `) + ` ${c.bCyan}│${c.reset}`);
  console.log(mid);

  for (const row of rows) {
    const cells = cols.map((col, idx) => {
      const val = row[idx] ?? "";
      return padText(val, col.width, col.align || "left");
    });
    console.log(`${c.bCyan}│${c.reset} ` + cells.join(` ${c.bCyan}│${c.reset} `) + ` ${c.bCyan}│${c.reset}`);
  }

  console.log(bot);
}

/**
 * Progress Bar bergaya modern (█ dan ░)
 */
function renderBar(n, total, lebar = 24) {
  if (total <= 0) return `${c.dim}${"░".repeat(lebar)}${c.reset}`;
  const pct = Math.max(0, Math.min(1, n / total));
  const isi = Math.round(pct * lebar);
  const warna = pct >= 1 ? c.bGreen : (pct >= 0.5 ? c.bCyan : c.bYellow);
  return `${warna}${"█".repeat(isi)}${c.reset}${c.dim}${"░".repeat(lebar - isi)}${c.reset}`;
}

function progressBar(n, total, lebar = 24) {
  const pct = total === 0 ? 0 : (n / total) * 100;
  return `${renderBar(n, total, lebar)} ${c.dim}${n}/${total}${c.reset} ${c.bWhite}${c.bold}${pct.toFixed(0)}%${c.reset}`;
}

// ============================================================================
// Banner, Card Left-Rail, and Boxed Layout
// ============================================================================

function banner() {
  const innerWidth = LINE_WIDTH;
  const top = `${c.bCyan}╭${"─".repeat(innerWidth)}╮${c.reset}`;
  const mid = `${c.bCyan}├${"─".repeat(innerWidth)}┤${c.reset}`;
  const bot = `${c.bCyan}╰${"─".repeat(innerWidth)}╯${c.reset}`;

  const row = (str) => {
    const vlen = visualLength(str);
    const pad = Math.max(0, innerWidth - vlen - 2);
    return `${c.bCyan}│${c.reset}  ${str}${" ".repeat(pad)}${c.bCyan}│${c.reset}`;
  };

  console.log(`\n${top}`);
  console.log(row(`${c.bWhite}${c.bold}⚡ QMS TESTNET & QWAP AUTO DAILY STREAK BOT${c.reset} ${c.gray}•${c.reset} ${c.bGreen}Multi-Wallet v2.0${c.reset}`));
  console.log(mid);
  console.log(row(`${c.gray}DEX Portal :${c.reset} ${c.bBlue}https://testnet.qwap.xyz/${c.reset}`));
  console.log(row(`${c.gray}Faucet     :${c.reset} ${c.bBlue}https://faucet.testnet.qms.finance/${c.reset}`));
  console.log(row(`${c.gray}Explorer   :${c.reset} ${c.bBlue}https://testnet.qmsscan.io/${c.reset}`));
  console.log(row(`${c.gray}Waktu      :${c.reset} ${c.white}${new Date().toLocaleString("id-ID")}${c.reset}`));
  console.log(`${bot}\n`);
}

/**
 * Card Left-Rail (Header blok akun)
 */
function cardStart(index, total, name, address, keyMasked = "") {
  const numBadge = `${c.bMagenta}[${index}/${total}]${c.reset}`;
  const shortAddr = address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : "";
  const keyInfo = keyMasked ? ` ${c.gray}(Key: ${keyMasked})${c.reset}` : "";
  console.log(`${c.bCyan}┌───${c.reset} ${numBadge} ${c.bWhite}${c.bold}${name}${c.reset} ${c.dim}${shortAddr}${c.reset}${keyInfo}`);
  console.log(`${c.bCyan}│${c.reset}`);
}

/**
 * Card Left-Rail Item
 */
function cardItem(label, value, icon = "•") {
  const paddedLabel = padText(label, 11, "left");
  console.log(`${c.bCyan}│${c.reset}  ${c.cyan}${icon}${c.reset} ${c.gray}${paddedLabel}:${c.reset} ${value}`);
}

/**
 * Card Left-Rail Footer
 */
function cardEnd() {
  console.log(`${c.bCyan}└───${c.reset}\n`);
}

/**
 * Summary Box (Box ringkasan akhir)
 */
function summaryBox(successCount, skipCount, errorCount, extraInfo = {}) {
  const total = successCount + skipCount + errorCount;
  const innerWidth = LINE_WIDTH;
  const top = `${c.bGreen}╭${"─".repeat(innerWidth)}╮${c.reset}`;
  const mid = `${c.bGreen}├${"─".repeat(innerWidth)}┤${c.reset}`;
  const bot = `${c.bGreen}╰${"─".repeat(innerWidth)}╯${c.reset}`;

  const centerTitle = padText("✦  RINGKASAN EKSEKUSI AKUN  ✦", innerWidth, "center");

  console.log(top);
  console.log(`${c.bGreen}│${c.reset}${c.bWhite}${c.bold}${centerTitle}${c.reset}${c.bGreen}│${c.reset}`);
  console.log(mid);

  // Bar progress visual
  const barText = "  " + progressBar(successCount, total, innerWidth - 20);
  const padBar = Math.max(0, innerWidth - visualLength(barText));
  console.log(`${c.bGreen}│${c.reset}${barText}${" ".repeat(padBar)}${c.bGreen}│${c.reset}`);
  console.log(mid);

  const rowStat = (icon, label, count, color) => {
    const left = `  ${icon}  ${label}`;
    const right = `${count}  `;
    const sisa = innerWidth - visualLength(left) - visualLength(right);
    return `${c.bGreen}│${c.reset}${color}${left}${" ".repeat(Math.max(1, sisa))}${right}${c.reset}${c.bGreen}│${c.reset}`;
  };

  console.log(rowStat("✔", "Berhasil Hari Ini", successCount, c.bGreen));
  console.log(rowStat("»", "Dilewati (Sudah)", skipCount, c.dim));
  console.log(rowStat("✖", "Gagal / Bermasalah", errorCount, errorCount > 0 ? c.bRed : c.dim));

  if (extraInfo.totalPoints !== undefined) {
    console.log(rowStat("🏆", "Total Quanta Points", `${extraInfo.totalPoints} pts`, c.bYellow));
  }

  console.log(bot);
  console.log("");
}

// ============================================================================
// Core Logging Functions
// ============================================================================

const logger = {
  c,
  stripAnsi,
  charWidth,
  visualLength,
  padText,
  renderTable,
  renderBar,
  progressBar,
  banner,
  cardStart,
  cardItem,
  cardEnd,
  summaryBox,
  DIVIDER_BOLD,
  DIVIDER_THIN,

  info: (msg, prefix = "") => {
    const ts = getTimestamp();
    const p = prefix ? `${c.bCyan}[${prefix}]${c.reset} ` : "";
    console.log(`${ts} ${c.cyan}ℹ${c.reset} ${c.bCyan}INFO${c.reset}  ${p}${msg}`);
  },

  success: (msg, prefix = "") => {
    const ts = getTimestamp();
    const p = prefix ? `${c.bGreen}[${prefix}]${c.reset} ` : "";
    console.log(`${ts} ${c.bGreen}✔${c.reset} ${c.bGreen}SUCCESS${c.reset} ${p}${msg}`);
  },

  warn: (msg, prefix = "") => {
    const ts = getTimestamp();
    const p = prefix ? `${c.bYellow}[${prefix}]${c.reset} ` : "";
    console.log(`${ts} ${c.bYellow}⚠${c.reset} ${c.bYellow}WARN${c.reset}  ${p}${msg}`);
  },

  error: (msg, prefix = "") => {
    const ts = getTimestamp();
    const p = prefix ? `${c.bRed}[${prefix}]${c.reset} ` : "";
    console.log(`${ts} ${c.bRed}✖${c.reset} ${c.bRed}ERROR${c.reset} ${p}${msg}`);
  },

  streak: (msg, prefix = "") => {
    const ts = getTimestamp();
    const p = prefix ? `${c.bMagenta}[${prefix}]${c.reset} ` : "";
    console.log(`${ts} ${c.bMagenta}🔥${c.reset} ${c.bMagenta}STREAK${c.reset} ${p}${msg}`);
  },

  divider: (bold = false) => {
    console.log(bold ? DIVIDER_BOLD : DIVIDER_THIN);
  }
};

module.exports = logger;
