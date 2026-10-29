const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const vm = require('vm');

const workerCode = fs.readFileSync(workerData.workerScriptPath, 'utf8');

const ctx = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Uint8Array,
    WebAssembly,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    location: { href: 'https://faucet.testnet.qms.finance/js/powfaucet-worker-a2.js' },
    postMessage: (msg) => {
        parentPort.postMessage(msg);
    },
    addEventListener: (type, fn) => {
        if (type === 'message') {
            parentPort.on('message', (data) => fn({ data }));
        }
    }
};
ctx.self = ctx;

vm.runInNewContext(workerCode, ctx);
