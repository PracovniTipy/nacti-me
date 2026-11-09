# Texty pro Microsoft Store (Partner Center)

**Název:** Načti.me

**Kategorie:** Produktivita (podkategorie: nástroje)

**Krátký popis (do 100 znaků):**
QR kódy, QR platby a vizitky k tisku. Bez registrace. S Pro i návrh vizitky na míru od AI.

**Popis:**
Načti.me je nejjednodušší cesta od nápadu k QR kódu, který opravdu funguje.

Vložte odkaz, text, e-mail nebo telefon a kód je hotový. Přepněte na Wi-Fi, kontakt, fotky nebo QR platbu a vyplňte pár údajů.

• QR platba podle českého standardu: číslo účtu, částka, variabilní symbol. Aplikace pozná překlep v čísle účtu.
• Kontakt v jednom kódu: jméno, firma, telefon, e-mail, web i adresa.
• Fotky v kódu: po naskenování se ukážou v telefonu.
• Wi-Fi pro hosty bez diktování hesla.
• Vizitky, kartičky A6 a samolepky k tisku v 600 DPI. Motiv podle oboru (cukrář, sklenář, zedník, automechanik a dalších 20), vlastní logo, přesouvání tažením a velikosti písma i kódu.
• Kontrola čitelnosti: aplikace řekne, jak malý kód můžete vytisknout, aby se spolehlivě načetl.
• Stažení v PNG i SVG pro tiskárnu.

Načti.me Pro (99 Kč měsíčně): návrh vizitky přesně na míru od AI s vlastní grafikou, dynamické kódy, které po vytištění změníte, statistiky skenů, uložené vizitky a kódy bez podpisu.

Od BrosWars Studio.

**Klíčová slova (max. 7):**
QR kód, QR platba, vizitka, generátor QR, Wi-Fi QR, samolepka, tisk

**Věkové hodnocení:** 3+ (bez nevhodného obsahu)

**Zásady ochrany osobních údajů:** https://nacti.me/privacy.html

**Snímky obrazovky:** hotové v `www/screenshots/` (1920×1080): úvod, vizitka, QR platba, Pro dashboard. Ke stažení i na https://nacti.me/screenshots/1-uvod.png atd.

## Jak aplikaci dostat do Microsoft Store (3 kroky, cca 15 minut)

1. **Partner Center** (partner.microsoft.com/dashboard) → Apps and games → New product → MSIX or PWA app → rezervujte název **Načti.me**.
   V části *Product management → Product identity* si opište **Package/Identity/Name**, **Publisher** (CN=…) a **Publisher display name**.
2. **PWABuilder** (pwabuilder.com) → zadejte `https://nacti.me` → Package For Stores → **Windows** → vložte tři údaje z kroku 1 → Download. Dostanete balíček `.msixbundle`.
3. V Partner Center → Packages nahrajte `.msixbundle`, vyplňte texty z tohoto souboru, nahrajte snímky obrazovky, cenu dejte **Zdarma** a odešlete ke kontrole (obvykle 1–3 dny).
