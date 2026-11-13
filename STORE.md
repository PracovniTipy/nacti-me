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

Načti.me Pro (99 Kč měsíčně, 50 AI návrhů) a Plus (249 Kč měsíčně, 500 AI návrhů): návrh vizitky přesně na míru od AI s vlastní grafikou, dynamické kódy, které po vytištění změníte, statistiky skenů, uložené vizitky a kódy bez podpisu.

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

---

# Google Play

**Název:** Načti.me – QR kódy a vizitky
**Krátký popis (do 80 znaků):** QR kódy, česká QR platba a vizitky k tisku. Bez registrace.
**Dlouhý popis:** stejný jako pro Microsoft Store výše.
**Kategorie:** Obchod (Business) · **Štítky:** QR kód, vizitky, QR platba
**Kontaktní e-mail:** váš e-mail · **Web:** https://nacti.me · **Zásady ochrany soukromí:** https://nacti.me/privacy.html
**Cena:** zdarma (předplatné Pro se platí na webu nacti.me, ne přes Google Play)

**Grafika (složka `store/`):**
- ikona 512×512: `google-play-ikona-512.png`
- hlavní obrázek 1024×500: `google-play-feature-1024x500.png`
- snímky telefonu 1080×1920: `telefon-1-qr.png`, `telefon-2-vizitka.png`, `telefon-3-platba.png`

**Bezpečnost údajů (Data safety) – odpovědi:**
- Sbírá aplikace data? **Ano**: fotky (jen ty, které uživatel sám vloží do QR kódu), e-mail (jen u předplatitelů Pro, od Stripe), diagnostika ne.
- Sdílí data s třetími stranami? **Ano**: text vizitky se pro AI návrh posílá službě Anthropic (jen Pro); platby Stripe.
- Šifrování při přenosu: **Ano** (HTTPS). Může uživatel požádat o smazání: **Ano** (e-mail v zásadách).
- Reklamy: **Ne**.

**Hodnocení obsahu:** dotazník → nástroj/utilita, bez násilí, bez sdílení polohy → PEGI 3.

## Jak dostat aplikaci na Google Play (cca 30 minut)
1. **Účet vývojáře:** play.google.com/console → registrace (jednorázově 25 USD), typ účtu „Organizace“ nebo „Osobní“, ověření totožnosti.
2. **Podpisový klíč do GitHubu:** github.com/PracovniTipy/nacti-me/settings/secrets/actions → přidejte
   `ANDROID_KEYSTORE_B64` (obsah souboru ANDROID_KEYSTORE_B64.txt) a `ANDROID_KEY_PASSWORD` (heslo ze souboru nacti-upload-klic.txt).
   Každé další sestavení pak vytvoří podepsaný soubor `app-release.aab` (Actions → poslední běh → Artifacts → Nacti-me-Android).
3. **V Play Console:** Vytvořit aplikaci → Načti.me → vyplnit texty a grafiku výše → Testování → **Interní testování** → nahrát `app-release.aab` → přidat sebe jako testera → vyzkoušet v telefonu.
4. **Nové osobní účty** musí mít nejdřív **uzavřený test s 12 testery po dobu 14 dní**, pak jde zažádat o produkční vydání. Promokód na Pro je ideální odměna pro testery.
