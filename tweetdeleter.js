// Twitter Toplu Tweet Silme Kodu - Düzeltilmiş v2.1
// Bu kodu Twitter/X web sitesinde browser console'da çalıştırın

class TwitterBulkDeleter {
    constructor() {
        this.deletedCount = 0;
        this.isRunning = false;
        this.speed = 17; // ms (saniyede ~60 tweet - 3x hızlandırılmış)
        this.maxRetries = 3;
        this.stats = {
            startTime: null,
            errors: 0,
            retries: 0
        };
        this.devMode = false;
        this.init();
    }

    init() {
        console.log(`
🚀 TWITTER BULK DELETER v2.1 - DEV MODE AVAILABLE
=================================================

BASIC COMMANDS:
• deleter.start()     - Silme işlemini başlat
• deleter.stop()      - İşlemi durdur
• deleter.status()    - Durum bilgisi göster

DEV MODE COMMANDS:
• deleter.devModeToggle() - Geliştirici modunu aç/kapat
• deleter.setSpeed(n)     - Hız ayarla (ms, örn: 100 = saniyede 10)
• deleter.simulate()      - Test modu (gerçekten silmez)

ADVANCED:
• deleter.debugMode()     - Hangi elementleri bulduğunu göster
        `);
    }

    devModeToggle() {
        this.devMode = !this.devMode;
        console.log(`🔧 Dev Mode: ${this.devMode ? 'AÇIK' : 'KAPALI'}`);
        if (this.devMode) {
            console.log('🛠️ Geliştirici özellikleri etkinleştirildi');
        }
    }

    setSpeed(ms) {
        this.speed = ms;
        const tweetsPerSecond = Math.round(1000 / ms);
        console.log(`⚡ Hız ayarlandı: ${ms}ms (saniyede ~${tweetsPerSecond} tweet)`);
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString('tr-TR');
        const prefix = {
            'info': '🔵',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
            'dev': '🔧'
        };
        
        console.log(`${prefix[type]} [${timestamp}] ${message}`);
    }

    async findTweetElements() {
        // Tweet'lerin bulunduğu ana container'ı bul
        const timeline = document.querySelector('[data-testid="primaryColumn"]') || 
                        document.querySelector('[role="main"]') ||
                        document.querySelector('main');
        
        if (!timeline) {
            this.log('Timeline bulunamadı', 'error');
            return [];
        }

        // X (Twitter) için güncel selector'lar
        const selectors = [
            '[data-testid="caret"]',
            'button[aria-label*="Daha"]',
            'button[aria-label*="More"]',
            '[data-testid="tweet"] button[aria-haspopup="menu"]',
            'div[role="button"][aria-haspopup="menu"]'
        ];

        for (const selector of selectors) {
            const elements = timeline.querySelectorAll(selector);
            if (elements.length > 0) {
                if (this.devMode) this.log(`${elements.length} adet tweet butonu bulundu: ${selector}`, 'dev');
                return Array.from(elements);
            }
        }
        
        this.log('Tweet butonları bulunamadı. Profilinizde olduğunuzdan emin olun.', 'warning');
        return [];
    }

    async deleteTweet(moreButton, simulate = false) {
        try {
            if (simulate) {
                this.log('SIMULATE: Tweet işlemi yapılacaktı', 'warning');
                return true;
            }

            // Elementin görünür olduğundan emin ol
            moreButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.wait(150); // Hızlandırıldı: 300ms -> 150ms

            // Tweet container'ını bul ve RT mi yoksa kendi tweeti mi kontrol et
            const tweetContainer = moreButton.closest('[data-testid="tweet"]');
            if (!tweetContainer) {
                this.log('Tweet container bulunamadı', 'error');
                return false;
            }

            // RT kontrolü - "Yeniden gönderdi" veya "retweeted" metni var mı?
            const isRetweet = tweetContainer.textContent.includes('Yeniden gönderdi') || 
                             tweetContainer.textContent.includes('retweeted') ||
                             tweetContainer.querySelector('[data-testid="socialContext"]');

            this.log(isRetweet ? 'RT tespit edildi - direkt RT butonuyla geri çekilecek' : 'Kendi tweeti - silinecek', 'info');

            // RT ise direkt RT butonunu bul ve tıkla
            if (isRetweet) {
                // RT butonunu ara (yeşil renkli, aktif olan)
                const retweetButton = tweetContainer.querySelector('[data-testid="retweet"]') ||
                                    tweetContainer.querySelector('button[aria-label*="Retweet"]') ||
                                    tweetContainer.querySelector('button[aria-label*="gönder"]');
                
                if (retweetButton) {
                    this.log('RT butonu bulundu, geri alınıyor...', 'info');
                    retweetButton.click();
                    await this.wait(250); // Hızlandırıldı: 500ms -> 250ms
                    
                    // RT geri alma onayını ara
                    const undoButton = document.querySelector('[data-testid="unretweetConfirm"]') ||
                                     document.querySelector('button:has-text("Retweet\'i geri al")') ||
                                     Array.from(document.querySelectorAll('button, div[role="menuitem"]')).find(btn => 
                                         btn.textContent.toLowerCase().includes('geri al') ||
                                         btn.textContent.toLowerCase().includes('undo')
                                     );
                    
                    if (undoButton) {
                        this.log('RT geri alma onayı bulundu', 'success');
                        undoButton.click();
                        await this.wait(400); // Hızlandırıldı: 800ms -> 400ms
                        return true;
                    } else {
                        this.log('RT geri alma onayı bulunamadı, menü yöntemiyle deneniyor...', 'warning');
                        // Menü yöntemine geç
                    }
                } else {
                    this.log('RT butonu bulunamadı, menü yöntemiyle deneniyor...', 'warning');
                }
            }

            // Kendi tweeti için veya RT menü yöntemi için üç nokta menüsünü aç
            moreButton.click();
            await this.wait(400); // Hızlandırıldı: 800ms -> 400ms

            let actionButton = null;
            
            for (let attempt = 0; attempt < 3; attempt++) {
                const menuItems = document.querySelectorAll('[role="menuitem"], [data-testid="menuItemButton"]');
                
                for (const item of menuItems) {
                    const text = item.textContent.toLowerCase();
                    
                    if (isRetweet) {
                        // RT için geri alma butonunu ara
                        if (text.includes('retweet\'i geri al') || 
                            text.includes('undo retweet') ||
                            text.includes('geri al') ||
                            text.includes('yeniden gönderi')) {
                            actionButton = item;
                            break;
                        }
                    } else {
                        // Kendi tweeti için silme butonunu ara
                        if (text.includes('sil') || text.includes('delete') || 
                            text.includes('tweet\'i sil') || text.includes('gönder')) {
                            actionButton = item;
                            break;
                        }
                    }
                }
                
                if (actionButton) break;
                await this.wait(150); // Hızlandırıldı: 300ms -> 150ms
            }

            if (!actionButton) {
                this.log(isRetweet ? 'RT geri alma butonu bulunamadı' : 'Sil butonu bulunamadı', 'warning');
                
                if (this.devMode) {
                    const menuItems = document.querySelectorAll('[role="menuitem"], [data-testid="menuItemButton"]');
                    menuItems.forEach((item, index) => {
                        this.log(`Menü ${index}: "${item.textContent.trim()}"`, 'dev');
                    });
                }
                
                document.body.click();
                await this.wait(150); // Hızlandırıldı: 300ms -> 150ms
                return false;
            }

            const actionType = isRetweet ? 'RT geri alınıyor' : 'Tweet siliniyor';
            this.log(`${actionType}: "${actionButton.textContent.trim()}"`, 'info');
            actionButton.click();
            await this.wait(250); // Hızlandırıldı: 500ms -> 250ms

            // RT geri alma için onay gerekmez genelde, ama kontrol et
            if (isRetweet) {
                this.log('✅ RT başarıyla geri alındı', 'success');
                await this.wait(400); // Hızlandırıldı: 800ms -> 400ms
                return true;
            }

            // Tweet silme için onay butonunu bul
            let confirmButton = null;
            
            for (let attempt = 0; attempt < 5; attempt++) {
                const allButtons = document.querySelectorAll('button, div[role="button"]');
                
                confirmButton = Array.from(allButtons).find(btn => {
                    const text = btn.textContent.toLowerCase();
                    return (text.includes('sil') || text.includes('delete')) && 
                           !btn.closest('[role="menu"]') &&
                           (btn.getAttribute('data-testid') === 'confirmationSheetConfirm' ||
                            text === 'sil' || text === 'delete');
                });
                
                if (confirmButton) break;
                await this.wait(100); // Hızlandırıldı: 200ms -> 100ms
            }
            
            if (confirmButton) {
                this.log('Onay butonu bulundu, tweet siliniyor...', 'success');
                confirmButton.click();
                await this.wait(400); // Hızlandırıldı: 800ms -> 400ms
                return true;
            } else {
                this.log('Onay butonu bulunamadı', 'error');
                return false;
            }

        } catch (error) {
            this.stats.errors++;
            this.log(`İşlem hatası: ${error.message}`, 'error');
            
            document.body.click();
            await this.wait(250); // Hızlandırıldı: 500ms -> 250ms
            return false;
        }
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async start(simulate = false) {
        if (this.isRunning) {
            this.log('Silme işlemi zaten çalışıyor...', 'warning');
            return;
        }

        // Basit profil kontrolü - sadece x.com olup olmadığını kontrol et
        if (!window.location.href.includes('x.com/')) {
            this.log('❌ Lütfen X.com sayfasında olduğunuzdan emin olun!', 'error');
            return;
        }
        
        this.log('✅ X.com sayfasında, işleme devam ediliyor...', 'info');

        this.isRunning = true;
        this.stats.startTime = Date.now();
        this.stats.retries = 0;
        this.log(`🚀 İşlem başlatılıyor... ${simulate ? '(SİMÜLASYON MODU)' : ''}`, 'info');
        
        let consecutiveFailures = 0;
        
        while (this.isRunning) {
            const tweetElements = await this.findTweetElements();
            
            if (tweetElements.length === 0) {
                consecutiveFailures++;
                if (consecutiveFailures >= 3) {
                    this.log('❌ Üst üste 3 kez tweet bulunamadı. İşlem durduruluyor.', 'error');
                    this.log('💡 Sayfayı yenileyin ve tekrar deneyin.', 'info');
                    break;
                }
                this.log('⚠️ Tweet bulunamadı, 1.5 saniye bekleyip tekrar deneniyor...', 'warning');
                await this.wait(1500); // Hızlandırıldı: 3000ms -> 1500ms
                continue;
            }

            consecutiveFailures = 0; // Başarılı bulma durumunda sıfırla
            
            const success = await this.deleteTweet(tweetElements[0], simulate);
            
            if (success) {
                this.deletedCount++;
                this.log(`✅ ${this.deletedCount} işlem tamamlandı (RT geri alındı veya tweet silindi)`, 'success');
                this.stats.retries = 0;
            } else {
                this.stats.retries++;
                this.log(`❌ Hata! Yeniden deneme: ${this.stats.retries}/${this.maxRetries}`, 'warning');
                
                if (this.stats.retries >= this.maxRetries) {
                    this.log('❌ Çok fazla hata. İşlem durduruldu.', 'error');
                    break;
                }
                
                await this.wait(1000); // Hızlandırıldı: 2000ms -> 1000ms
                continue;
            }

            await this.wait(this.speed);
        }

        this.stop();
    }

    stop() {
        this.isRunning = false;
        const duration = this.stats.startTime ? (Date.now() - this.stats.startTime) / 1000 : 0;
        this.log(`🛑 İşlem durduruldu. Süre: ${duration.toFixed(1)}s`, 'info');
        this.log(`📊 Toplam silinen: ${this.deletedCount}`, 'success');
    }

    status() {
        const duration = this.stats.startTime ? (Date.now() - this.stats.startTime) / 1000 : 0;
        console.table({
            'Durum': this.isRunning ? '🟢 ÇALIŞIYOR' : '🔴 DURDU',
            'Silinen Tweet': this.deletedCount,
            'Hız (ms)': this.speed,
            'Süre (sn)': duration.toFixed(1),
            'Hata Sayısı': this.stats.errors,
            'Yeniden Deneme': this.stats.retries,
            'Dev Mode': this.devMode ? '🟢 AÇIK' : '🔴 KAPALI'
        });
    }

    simulate() {
        this.log('🧪 Test modu başlatılıyor...', 'warning');
        this.start(true);
    }

    debugMode() {
        this.log('🔍 Debug modu - elementler taranıyor...', 'info');
        
        const timeline = document.querySelector('[data-testid="primaryColumn"]') || 
                        document.querySelector('[role="main"]');
        
        if (!timeline) {
            this.log('❌ Timeline bulunamadı', 'error');
            return;
        }

        const selectors = [
            '[data-testid="caret"]',
            'button[aria-label*="Daha"]',
            'button[aria-label*="More"]',
            '[data-testid="tweet"] button[aria-haspopup="menu"]'
        ];

        selectors.forEach(selector => {
            const elements = timeline.querySelectorAll(selector);
            console.log(`🔍 ${selector}: ${elements.length} adet`);
        });

        // Tweet container'larını da kontrol et
        const tweets = timeline.querySelectorAll('[data-testid="tweet"]');
        console.log(`🐦 Toplam tweet container: ${tweets.length}`);
    }
}

// Global instance oluştur
const deleter = new TwitterBulkDeleter();

// Kısayollar
const start = () => deleter.start();
const stop = () => deleter.stop();
const status = () => deleter.status();
const devMode = () => deleter.devModeToggle();
const simulate = () => deleter.simulate();
const debug = () => deleter.debugMode();

console.log(`
🎯 HIZLI KOMUTLAR:
• start()    - İşlemi başlat
• stop()     - İşlemi durdur  
• status()   - Durum göster
• simulate() - Test modu
• debug()    - Element kontrolü
• devMode()  - Dev mode aç/kapat
`);