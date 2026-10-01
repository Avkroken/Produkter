# Distribution och appbutiker

Produkter har flera runtimes. Appbutiks-/PWA-spåret gäller den canonical Cloudflare-appen och ändrar inte Python-appen, scraper-API:t, engine eller processor.

## PWA-bas

Cloudflare-appen publicerar web app manifest, 192/512-ikoner och en service worker. Service workern är avsiktligt network-only och cachear inte auth, provider credentials, jobb, katalogstate, prisbevakning eller API-svar.

## Microsoft Store

Canonical webbapp är tekniskt förberedd för PWA-paketering via HTTPS + manifest + service worker. Microsoft Partner Center äger Store-identitet, Publisher ID och signerat paket; dessa värden ska inte fabriceras i repositoryt.

## Google Play

Webbappen kan användas som grund för en Trusted Web Activity-wrapper. Publicering kräver en verklig Android package identity och signeringscertifikat. Publicera inte `.well-known/assetlinks.json` innan korrekt SHA-256-fingerprint finns.

## Apple

Webbappen kan installeras som webbapp från Safari. En App Store-listning kräver separat iOS-wrapper/app, bundle identity och Apple-signering. Repositoryt ska inte innehålla placeholder-Team ID eller signing credentials.

## Portal

Avkroken-portalen ska endast exponera verifierade butikslänkar efter att en faktisk listing är publicerad.
