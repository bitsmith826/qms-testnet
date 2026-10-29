const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');

const WORKER_SCRIPT = path.join(__dirname, 'pow_worker_thread.js');
const ARGON2_SCRIPT = path.join(__dirname, 'powfaucet-worker-a2.js');

const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

async function runMinerEngine({ sessionId, numWorkers = 6, targetReward = 1.05 }) {
    // 1. Fetch Session Status
    const statusRes = await fetch(`https://faucet.testnet.qms.finance/api/getSessionStatus?session=${sessionId}&details=1`);
    if (!statusRes.ok) {
        throw new Error(`Gagal mengambil status sesi: HTTP ${statusRes.status}`);
    }
    const sessionData = await statusRes.json();
    if (sessionData.status !== 'running') {
        throw new Error(`Sesi tidak dalam status running (Status: ${sessionData.status})`);
    }

    const targetAddr = sessionData.target;
    const preimage = sessionData.details?.data?.['pow.preimage'];
    if (!preimage) {
        throw new Error('Preimage tidak ditemukan dalam detail sesi!');
    }

    const params = { a: 'argon2', t: 0, v: 13, i: 4, m: 4096, p: 1, l: 16 };
    const difficulty = 11;

    // 2. Connect WebSocket
    const wsUrl = `wss://faucet.testnet.qms.finance/ws/pow?session=${sessionId}&cliver=2.5.1`;
    const ws = new WebSocket(wsUrl);

    let reqId = 1;
    let globalNonce = 10000;
    let totalSharesSubmitted = 0;
    let currentBalanceWei = BigInt(sessionData.balance || '0');
    let isClaiming = false;
    let workers = [];
    let workerHashrates = {};
    const startTime = Date.now();

    function formatQms(wei) {
        return (Number(wei) / 1e18).toFixed(4);
    }

    function getTotalHashrate() {
        return Object.values(workerHashrates).reduce((acc, h) => acc + h, 0).toFixed(1);
    }

    return new Promise((resolve, reject) => {
        ws.onopen = () => {
            for (let i = 0; i < numWorkers; i++) {
                startWorker(i);
            }
        };

        function startWorker(workerId) {
            const worker = new Worker(WORKER_SCRIPT, {
                workerData: { workerScriptPath: ARGON2_SCRIPT }
            });

            worker.on('message', (msg) => {
                if (msg.action === 'init') {
                    const start = globalNonce;
                    globalNonce += 250;
                    worker.postMessage({
                        action: 'setWork',
                        data: {
                            workerid: workerId,
                            preimage,
                            params,
                            difficulty,
                            nonceStart: start,
                            nonceCount: 250
                        }
                    });
                } else if (msg.action === 'stats') {
                    const s = msg.data;
                    const hr = s.time > 0 ? (s.shares / s.time) * 1000 : 0;
                    workerHashrates[workerId] = hr;

                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    const currentQms = formatQms(currentBalanceWei);
                    process.stdout.write(
                        `\r  [${elapsed}s] Speed: ${C.cyan}${getTotalHashrate()} H/s${C.reset} | Shares: ${C.yellow}${totalSharesSubmitted}${C.reset} | Saldo: ${C.green}${currentQms}${C.reset} / ${targetReward} QMS  `
                    );

                    if (s.nonces < 100) {
                        const start = globalNonce;
                        globalNonce += 250;
                        worker.postMessage({
                            action: 'addRange',
                            data: { start, count: 250 }
                        });
                    }
                } else if (msg.action === 'nonce') {
                    totalSharesSubmitted++;
                    const hr = parseFloat(getTotalHashrate()) || 30;
                    const sharePayload = {
                        id: reqId++,
                        action: 'foundShare',
                        data: {
                            nonce: msg.data.nonce,
                            data: msg.data.data,
                            params: msg.data.params,
                            hashrate: hr
                        }
                    };
                    ws.send(JSON.stringify(sharePayload));
                } else if (msg.action === 'verifyResult') {
                    ws.send(JSON.stringify({
                        id: reqId++,
                        action: 'verifyResult',
                        data: msg.data
                    }));
                }
            });

            worker.on('error', (err) => console.error(`Worker ${workerId} error:`, err));
            workers.push(worker);
        }

        ws.onmessage = async (evt) => {
            try {
                const msg = JSON.parse(evt.data);

                if (msg.action === 'verify') {
                    if (workers.length > 0) {
                        workers[0].postMessage({
                            action: 'verify',
                            data: msg.data
                        });
                    }
                } else if (msg.action === 'updateBalance') {
                    currentBalanceWei = BigInt(msg.data.balance || '0');
                    const qms = formatQms(currentBalanceWei);

                    if (Number(qms) >= targetReward && !isClaiming) {
                        isClaiming = true;
                        process.stdout.write('\n');

                        // 1. Terminate all workers
                        for (const w of workers) {
                            try { w.terminate(); } catch (e) {}
                        }

                        // 2. Send closeSession
                        try {
                            ws.send(JSON.stringify({ id: reqId++, action: 'closeSession' }));
                        } catch (e) {}

                        // 3. Wait for session to become claimable
                        for (let i = 0; i < 10; i++) {
                            await new Promise((r) => setTimeout(r, 1000));
                            try {
                                const chk = await fetch(`https://faucet.testnet.qms.finance/api/getSessionStatus?session=${sessionId}`);
                                const chkJson = await chk.json();
                                if (chkJson.status === 'claimable') {
                                    break;
                                }
                            } catch (e) {}
                        }

                        try { ws.close(); } catch (e) {}

                        // 4. Claim reward
                        const claimRes = await fetch('https://faucet.testnet.qms.finance/api/claimReward', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ session: sessionId })
                        });

                        const claimData = await claimRes.json();
                        let txHash = null;

                        for (let i = 0; i < 30; i++) {
                            await new Promise((r) => setTimeout(r, 2000));
                            const pollRes = await fetch(`https://faucet.testnet.qms.finance/api/getSessionStatus?session=${sessionId}&details=1`);
                            if (pollRes.ok) {
                                const st = await pollRes.json();
                                if (st.details?.claim?.txid || st.details?.claim?.txHash) {
                                    txHash = st.details.claim.txid || st.details.claim.txHash;
                                    break;
                                }
                                if (st.status === 'finished') {
                                    txHash = st.details?.claim?.txid || st.details?.claim?.txHash;
                                    break;
                                }
                            }
                        }

                        resolve({
                            target: targetAddr,
                            txHash,
                            balanceWei: currentBalanceWei,
                            claimData
                        });
                    }
                }
            } catch (e) {
                reject(e);
            }
        };

        ws.onerror = (err) => reject(new Error(`WebSocket error: ${err.message}`));
        ws.onclose = () => {
            if (!isClaiming) {
                reject(new Error('WebSocket ditutup sebelum target tercapai'));
            }
        };
    });
}

module.exports = { runMinerEngine };
