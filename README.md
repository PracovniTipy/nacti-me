# Načti.me · BrosWars Studio

Jedna aplikace pro **Windows (Microsoft Store), Android, iPhone a web**. Celá běží v zařízení, nepotřebuje server ani databázi.

Umí:
- QR kód na odkaz, text, e-mail, telefon, Wi-Fi, kontakt (vizitka) a **českou QR platbu**
- stažení PNG a SVG
- tiskoviny: vizitku 85×55, kartičku A6 a samolepku 50×50 s kontrolou čitelnosti

> V samostatné aplikaci navrhuje tiskoviny z připravených stylů. Návrhy od AI fungují ve verzi na claude.ai. Pro AI v aplikaci je potřeba malý server s API klíčem (lze doplnit později).

## Struktura
```
www/                  hotová aplikace (index.html, manifest, offline režim, ikony)
android/  ios/        mobilní projekty (Capacitor)
.github/workflows/    automatické zveřejnění webu a sestavení Androidu
```

## 1. Zveřejnění (nutné pro Microsoft Store)
1. Nahrajte složku do nového repozitáře na GitHubu (větev `main`).
2. **Settings → Pages → Source: GitHub Actions.**
3. Po pár minutách běží aplikace na `https://<účet>.github.io/<repozitář>/`.

## 2. Microsoft Store
1. Otevřete [pwabuilder.com](https://www.pwabuilder.com), vložte adresu z kroku 1 → **Package for stores → Windows**.
2. Údaje *Package ID*, *Publisher* a *Publisher display name* najdete v **Partner Center → vaše aplikace → Product identity** (nejdřív si v Partner Center rezervujte název aplikace).
3. Stažený balíček `.msixbundle` nahrajte v Partner Center do nového odeslání (Submission) a doplňte popis, snímky obrazovky a věkové hodnocení.

## 3. Android (Google Play)
- GitHub → **Actions → Aplikace** → stáhněte `Nacti-me-Android` (`.apk` na zkoušku do telefonu, `.aab` pro Google Play).
- Pro Google Play musí být `.aab` podepsaný: v Android Studiu `npm run android` → **Build → Generate Signed App Bundle**. Podpisový klíč dobře zálohujte.

## 4. iPhone
Potřebujete Mac s Xcode a účet Apple Developer: `npm install && npm run ios` → v Xcode vyberte tým → **Product → Archive**.

## Úpravy
Celá aplikace je v `www/index.html`. Po změně stačí `git push` (web) a `npx cap sync` (mobil).

## Server: Cloudflare (složka `cloudflare/`)

Jeden Cloudflare Worker `nacti-api` obsluhuje fotky (R2), AI návrhy, dynamické kódy se statistikami (D1)
a předplatné Pro přes Stripe. Přihlášení je bez hesla: po zaplacení dostane zařízení token,
další zařízení se přidá naskenováním QR kódu z dashboardu (tlačítko Přidat zařízení).

Nasazuje se samo při každém pushi (GitHub Actions), když jsou v repozitáři nastavené GitHub secrets:

| Secret | K čemu |
|---|---|
| `CLOUDFLARE_API_TOKEN` | povinné – nasazení Workeru, D1 a R2 |
| `CLOUDFLARE_ACCOUNT_ID` | jen pokud má token přístup k více účtům |
| `ANTHROPIC_API_KEY` | AI návrhy vizitek |
| `STRIPE_SECRET_KEY` | předplatné Načti.me Pro (99 Kč měsíčně) |

Adresu API workflow sám zapíše do `www/config.js`.
