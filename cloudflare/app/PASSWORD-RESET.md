# Lösenordsåterställning

`Glömt lösenord?` visas alltid på inloggningsformuläret. `POST /api/auth/forgot-password` svarar likadant för kända och okända adresser. Mejl skickas via befintliga Resend-integrationen. Hemligheten `RESEND_API_KEY` måste finnas på Workern och avsändardomänen för `MAIL_FROM` måste vara verifierad hos Resend.

Länken använder fast HTTPS-origin, en slumpmässig 256-bitars token i URL-fragmentet och 20 minuters giltighet. Bara SHA-256-hashen lagras i D1. Lösenordsbytet är ett villkorat atomiskt UPDATE i en D1-batch. Samma token kan inte användas två gånger, även vid samtidiga anrop. `auth_version` ändras och kontots tidigare KV-sessioner, inklusive äldre format, slutar fungera. Användaren loggar därefter in normalt; Cloudflare Access-skyddet för admin påverkas inte.

## Driftsättning

1. `npm run deploy` förbereder nu automatiskt auth-schemat via D1 före publicering. Steget kan köras flera gånger, ändrar inga befintliga lösenord och avbryter deploy vid databasfel. Byggtoken behöver D1-skrivrättighet. Vid `--dry-run` hoppas databassteget över. SQL-filerna 0002 och 0003 finns för manuell migrering; kör inte 0002 igen på en redan migrerad databas.
2. Konfigurera `RESEND_API_KEY` som Worker-hemlighet och verifiera avsändardomänen. Hemligheter ska aldrig läggas i Git.
3. Bygg och publicera `cloudflare/app` med tillhörande `public`-katalog. De nya API-rutterna täcks av befintliga `/api/*` i `run_worker_first` och ska vara publikt åtkomliga, medan admin fortsätter kräva Access.
4. Testa Glömt lösenord via webbplatsen med ett konto du äger. Kontrollera leverans, engångslänk, nytt lösenord och att gammal session inte längre fungerar. Skicka inte produktionstokens till loggar eller chattar.

Tester: `node cloudflare/scripts/password-reset.test.mjs` (efter `npm ci` i `cloudflare/app`). De kör i lokal Workers-runtime med D1, KV och simulerade mejl. Inga riktiga mejl skickas.

Microsoft/Google-inloggning använder egna OAuth-hemligheter och repareras inte av att Resend konfigureras.

Git-konfigurationen styr publiceringen. `workers_dev: false`, `preview_urls: false` och avstängda förhandsvisningar på custom domain bevarar skyddet även vid automatiska byggen.
