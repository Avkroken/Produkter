# Changelog

## [1.3.0](https://github.com/Avkroken/Produkter/compare/v1.2.32...v1.3.0) (2026-09-04)


### Features

* använd AI-motivering i utskriftsunderlag ([07f2f6f](https://github.com/Avkroken/Produkter/commit/07f2f6fd43a2cbf346ffe6ddf6f0b1bebe9cf679))
* använd crawl som primär produktinsamling ([#275](https://github.com/Avkroken/Produkter/issues/275)) ([ea8d6dd](https://github.com/Avkroken/Produkter/commit/ea8d6ddb8106be392791254c8699bf58ad059545))
* automate Codex security remediation ([#261](https://github.com/Avkroken/Produkter/issues/261)) ([0d21241](https://github.com/Avkroken/Produkter/commit/0d212419bd07bfa3ee55b6a689aacf296d4e68be))
* backfill security alerts across organization ([#251](https://github.com/Avkroken/Produkter/issues/251)) ([f935d71](https://github.com/Avkroken/Produkter/commit/f935d71ba1bcf135388e45f21e1d20aa1db29538))
* email secret scanning alerts immediately ([149c050](https://github.com/Avkroken/Produkter/commit/149c05049a8fa4ef02148aa2935cce7171739e78))
* email Secret Scanning alerts immediately ([#262](https://github.com/Avkroken/Produkter/issues/262)) ([149c050](https://github.com/Avkroken/Produkter/commit/149c05049a8fa4ef02148aa2935cce7171739e78))
* enable metadata-only AI issue triage ([#620](https://github.com/Avkroken/Produkter/issues/620)) ([f8c0337](https://github.com/Avkroken/Produkter/commit/f8c0337198619f09fc2ead10817f5238170fad8f))
* exportera biståndsunderlag som CSV ([#285](https://github.com/Avkroken/Produkter/issues/285)) ([e47e36c](https://github.com/Avkroken/Produkter/commit/e47e36cc32ae286d7333c91a68e24533bf72b50d))
* fyll utskriftsmotivering automatiskt ([#277](https://github.com/Avkroken/Produkter/issues/277)) ([07f2f6f](https://github.com/Avkroken/Produkter/commit/07f2f6fd43a2cbf346ffe6ddf6f0b1bebe9cf679))
* route engine AI through Cloudflare gateway ([#300](https://github.com/Avkroken/Produkter/issues/300)) ([cca145a](https://github.com/Avkroken/Produkter/commit/cca145ab4a4b9eca879f4af338dae2e738127c7c))
* run scraper jobs with Cloudflare Browser Run ([#268](https://github.com/Avkroken/Produkter/issues/268)) ([9f180de](https://github.com/Avkroken/Produkter/commit/9f180de3e774a219da7ae113e54a0af9907d7da7))


### Fixes

* använd intern service binding till motorn ([#272](https://github.com/Avkroken/Produkter/issues/272)) ([6612626](https://github.com/Avkroken/Produkter/commit/661262688141507843b1f99b0618d288cbab835b))
* apt-get upgrade så imagen patchar sig själv vid bygge ([#275](https://github.com/Avkroken/Produkter/issues/275)) ([b9b3c63](https://github.com/Avkroken/Produkter/commit/b9b3c6362fe13d384d8260e5dd96374f062572bf))
* block partial SSRF in scraper navigation ([#265](https://github.com/Avkroken/Produkter/issues/265)) ([59b4050](https://github.com/Avkroken/Produkter/commit/59b40509138cf378d9452ae1b7beb1835181752e))
* **cloudflare:** ta bort namnkollision och dokumentera domänägarskap ([cca8797](https://github.com/Avkroken/Produkter/commit/cca8797108fe41e8217e33b302ea3389308ab191))
* **cloudflare:** ta bort namnkollision och dokumentera domänägarskap ([#199](https://github.com/Avkroken/Produkter/issues/199)) ([7b2d513](https://github.com/Avkroken/Produkter/commit/7b2d51306be62fd87627e0ff74485310aa5d41dc))
* deduplicera detail-prishistorik ([#283](https://github.com/Avkroken/Produkter/issues/283)) ([e5dc619](https://github.com/Avkroken/Produkter/commit/e5dc6190d719c93f0462c6a8a71f26fec0c6581f))
* distinguish missing render jobs ([#299](https://github.com/Avkroken/Produkter/issues/299)) ([7c4cabb](https://github.com/Avkroken/Produkter/commit/7c4cabb66e1f99cfb30dae06da26d8f8828076ad))
* härda Browser Run-resultat ([#278](https://github.com/Avkroken/Produkter/issues/278)) ([1147137](https://github.com/Avkroken/Produkter/commit/1147137e85c5ca6b4bf706751325b95cb6b2e53a))
* härda Browser Run-scrapern ([#269](https://github.com/Avkroken/Produkter/issues/269)) ([28f4502](https://github.com/Avkroken/Produkter/commit/28f450271cb4ed4fe2de527489caab2205b71a32))
* härda CSV-exporten ([#288](https://github.com/Avkroken/Produkter/issues/288)) ([216dab6](https://github.com/Avkroken/Produkter/commit/216dab6dbb1bd5dc9801bf7dc8a77cdd503ac28d))
* harden CSV export ([216dab6](https://github.com/Avkroken/Produkter/commit/216dab6dbb1bd5dc9801bf7dc8a77cdd503ac28d))
* improve security alerts worker observability and webhook coverage ([#249](https://github.com/Avkroken/Produkter/issues/249)) ([571f221](https://github.com/Avkroken/Produkter/commit/571f221a643905a15f2813cd6efcfaf18dcb8479))
* invalidera stale beskrivningar efter detail-rendering ([#284](https://github.com/Avkroken/Produkter/issues/284)) ([ac97317](https://github.com/Avkroken/Produkter/commit/ac9731723358eeca64203c76b72dd410b399a015))
* koppla Browser Run direkt till renderkön ([#273](https://github.com/Avkroken/Produkter/issues/273)) ([02e9211](https://github.com/Avkroken/Produkter/commit/02e92111ccbdf5e10828eae887939f9dc9615e82))
* remove unsupported observability key ([#302](https://github.com/Avkroken/Produkter/issues/302)) ([1cc4f69](https://github.com/Avkroken/Produkter/commit/1cc4f6926b635868dedf390bf17e0c26c3d9981d))
* require evidence for review resolutions ([#263](https://github.com/Avkroken/Produkter/issues/263)) ([4e38adc](https://github.com/Avkroken/Produkter/commit/4e38adc29c39a34c1225e03d8b79fb5a62612f6a))
* **security:** remediate issue [#252](https://github.com/Avkroken/Produkter/issues/252) ([#287](https://github.com/Avkroken/Produkter/issues/287)) ([c087940](https://github.com/Avkroken/Produkter/commit/c087940fe7c92317e7b8009fd2b10e33e2a10d9f))
* **security:** sanitize remaining log values ([#295](https://github.com/Avkroken/Produkter/issues/295)) ([bd08996](https://github.com/Avkroken/Produkter/commit/bd089966c8f0c26879e860852dbf099359d130f3))
* select authorized scraper URLs server-side ([#267](https://github.com/Avkroken/Produkter/issues/267)) ([3237d3a](https://github.com/Avkroken/Produkter/commit/3237d3a463c841e9352e3d9944e250a330af6114))
* serialize security issue deduplication ([2158ab9](https://github.com/Avkroken/Produkter/commit/2158ab9c28c351e72af101a9b28e6dd087304952))
* serialize security Issue deduplication ([#264](https://github.com/Avkroken/Produkter/issues/264)) ([2158ab9](https://github.com/Avkroken/Produkter/commit/2158ab9c28c351e72af101a9b28e6dd087304952))
* skicka ofullständiga crawl-produkter till detail-rendering ([#281](https://github.com/Avkroken/Produkter/issues/281)) ([36e1c5d](https://github.com/Avkroken/Produkter/commit/36e1c5d05a1c3395a87dd4f1d876459bcfb416f2))
* stoppa redundant Browser Run-kö ([#294](https://github.com/Avkroken/Produkter/issues/294)) ([1e80b4d](https://github.com/Avkroken/Produkter/commit/1e80b4d3d3abe7e3f827dc6f7f07491770f7b5c5))
* synka engine-lockfilen ([#270](https://github.com/Avkroken/Produkter/issues/270)) ([7925027](https://github.com/Avkroken/Produkter/commit/7925027f51412cb8d1129dad64523350311cb678))
* tolka saknad valuta som SEK för svenska butiker ([#282](https://github.com/Avkroken/Produkter/issues/282)) ([9cecbf6](https://github.com/Avkroken/Produkter/commit/9cecbf6888b7649e983abecbaf26886c7d8418f0))
* unblock merge queue and remediate xmldom ([#625](https://github.com/Avkroken/Produkter/issues/625)) ([4797b5a](https://github.com/Avkroken/Produkter/commit/4797b5a025422b5f112da3d00ca6ec58977552ef))
* undvik återkommande D1-migrationsfel ([#286](https://github.com/Avkroken/Produkter/issues/286)) ([da1d974](https://github.com/Avkroken/Produkter/commit/da1d97459466ef1770602b655a1a8bbf095d0814))
* uppgradera pip/setuptools/wheel i imagen ([#284](https://github.com/Avkroken/Produkter/issues/284)) ([c940c61](https://github.com/Avkroken/Produkter/commit/c940c6196d047567e4155279981d68bc09eb0327))
* use organization webhook for security alerts ([#250](https://github.com/Avkroken/Produkter/issues/250)) ([2826855](https://github.com/Avkroken/Produkter/commit/2826855d75ee99a93f59b9dccb05dd74e02552d2))


### Documentation

* align AGENTS merge policy ([#218](https://github.com/Avkroken/Produkter/issues/218)) ([2466603](https://github.com/Avkroken/Produkter/commit/2466603a3cb61dd72f81b785bfd0d80f93532f7e))
* align AGENTS merge policy with repository settings ([2466603](https://github.com/Avkroken/Produkter/commit/2466603a3cb61dd72f81b785bfd0d80f93532f7e))
* align CI branch and merge policy ([#219](https://github.com/Avkroken/Produkter/issues/219)) ([1f0a9c7](https://github.com/Avkroken/Produkter/commit/1f0a9c71d9b2cbbddbb3eff1ad835f415854c0f7))
* centralize agent policy ([#623](https://github.com/Avkroken/Produkter/issues/623)) ([e09ad0a](https://github.com/Avkroken/Produkter/commit/e09ad0ab0bd964988743e35b18b0af542437c289))
* clarify central agent policy authority ([#624](https://github.com/Avkroken/Produkter/issues/624)) ([56606e9](https://github.com/Avkroken/Produkter/commit/56606e9c8daf387e23c647847982e583a461d3a0))
* clarify central policy authority ([56606e9](https://github.com/Avkroken/Produkter/commit/56606e9c8daf387e23c647847982e583a461d3a0))
* consolidate authoritative AI agent policy ([#296](https://github.com/Avkroken/Produkter/issues/296)) ([e263ab5](https://github.com/Avkroken/Produkter/commit/e263ab57df79e052110f7f8bff7ee7157adcc5d0))
* förtydliga PR- och auto-merge-praxis ([cb17799](https://github.com/Avkroken/Produkter/commit/cb1779923aac7e69cc65ca2b45c00b1d5dd7a258))
* frys PR-scope efter öppning ([340e61c](https://github.com/Avkroken/Produkter/commit/340e61c3ab1d51faf3d9ede791f494241be602ca))
* gör PR-gates och auto-merge explicita ([#276](https://github.com/Avkroken/Produkter/issues/276)) ([cb17799](https://github.com/Avkroken/Produkter/commit/cb1779923aac7e69cc65ca2b45c00b1d5dd7a258))
* merge-förbudet gäller eget initiativ, inte uttryckliga instruktioner ([#193](https://github.com/Avkroken/Produkter/issues/193)) ([56b8180](https://github.com/Avkroken/Produkter/commit/56b8180593a780183e88eacbb4be5d2f6648d70a))
* rätta agent-reglerna som motsade praktiken ([562cadc](https://github.com/Avkroken/Produkter/commit/562cadcec502c793b95a3830786e3001683a30ac))
* skriv in svarsformatet från i-have-adhd i AGENTS.md ([39306f3](https://github.com/Avkroken/Produkter/commit/39306f39cc36c15d1eaf1818a81c9e40c96bab73))
* skriv in svarsformatet från i-have-adhd i AGENTS.md ([#192](https://github.com/Avkroken/Produkter/issues/192)) ([fab1c13](https://github.com/Avkroken/Produkter/commit/fab1c1307bce972cb21b0adfb1757331a040dd6f))
* unify community health files ([#626](https://github.com/Avkroken/Produkter/issues/626)) ([a2b721d](https://github.com/Avkroken/Produkter/commit/a2b721d63efadfd6e4044d3699f2c32c1808afea))
