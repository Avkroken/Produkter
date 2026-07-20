---
title: "Stealth Mode & Bot Bypass"
wiki_page_id: "feature-stealth"
---

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [scraper/scraper.py](scraper/scraper.py)
- [scraper/enrich.py](scraper/enrich.py)
- [webui/app.py](webui/app.py)
- [webui/templates/config.html](webui/templates/config.html)
- [CHANGELOG.md](CHANGELOG.md)
- [README.md](README.md)
</details>

# Stealth Mode & Bot Bypass

Stealth Mode is a specialized subsystem within the Scraper platform designed to navigate and bypass modern anti-bot protections such as Akamai, Cloudflare, and PerimeterX. It combines browser-level obfuscation, behavioral simulation, and network-level masking to ensure reliable data extraction from high-security e-commerce targets.

The system operates by integrating `playwright-stealth` to mask browser fingerprints, implementing randomized human-like delays, and supporting SOCKS5/HTTP proxies on a per-site basis. Users can activate these features globally or specifically for configurations known to employ aggressive bot detection.

Sources: [README.md:14](README.md#L14), [scraper/scraper.py:841-860](scraper/scraper.py#L841-L860), [CHANGELOG.md:83-85](CHANGELOG.md#L83-L85)

## Bot Protection Detection

The platform includes a heuristic detection engine that identifies specific anti-bot providers based on DOM markers, cookies, and script sources. This allows the system to recommend the activation of Stealth Mode during the initial site configuration.

### Detection Heuristics
The detection logic identifies several major providers:
*  **Akamai**: Detected via the `_abck` cookie or presence of `akam` in script sources.
*  **Cloudflare**: Identified by `cf-challenge-running` elements or `cf_clearance` cookies.
*  **PerimeterX**: Recognized by `px-captcha` identifiers.
*  **Distil Networks**: Spotted via specific body classes or script references.

The following sequence shows how the system detects these protections during the URL discovery phase:

```mermaid
sequenceDiagram
    participant UI as WebUI
    participant Eng as Scraper Engine
    participant Browser as Playwright (Chromium)
    participant Target as Target Website

    UI->>Eng: POST /detect (URL)
    Eng->>Browser: Launch Headless with Stealth
    Browser->>Target: Navigate (domcontentloaded)
    Note right of Target: Executes bot_detect_js
    Target-->>Browser: DOM/Cookies/Scripts
    Browser-->>Eng: Protection Type (e.g., 'akamai')
    Eng-->>UI: use_stealth: true + Protection Name
```

Sources: [scraper/scraper.py:841-860](scraper/scraper.py#L841-L860), [webui/app.py:165-171](webui/app.py#L165-L171)

## Stealth Implementation Architecture

The stealth system is implemented at the browser context level. When a site configuration has `use_stealth` enabled, the scraper applies multiple layers of obfuscation to the Playwright instance.

### Core Components
*  **Playwright Stealth**: Uses the `Stealth` class to apply patches that hide automation indicators (e.g., `navigator.webdriver`).
*  **Behavioral Jitter**: Implements `random.randint(2000, 5000)` millisecond waits after navigation and jitter between page loads to avoid detection of programmatic patterns.
*  **Browser Fingerprinting**: Hardcoded production-grade User-Agents and HTTP headers (e.g., `DNT: 1`, specific `Accept-Language`) are used to mimic legitimate Swedish consumers.

```mermaid
flowchart TD
    A[Scrape Task Start] --> B{use_stealth == 1?}
    B -- Yes --> C[Apply Stealth Patches]
    B -- No --> D[Standard Context]
    C --> E[Set Random User-Agent/Headers]
    D --> E
    E --> F[Navigate with Random Delay]
    F --> G[Extract Product Data]
    G --> H[Wait 1-3s Jitter]
    H --> I[End/Next Page]
```

Sources: [scraper/scraper.py:469-485](scraper/scraper.py#L469-L485), [scraper/scraper.py:537-547](scraper/scraper.py#L537-L547), [scraper/enrich.py:149-163](scraper/enrich.py#L149-L163)

## Network Masking (Proxy Support)

To bypass IP-based rate limiting or geographic blocking, the system supports SOCKS5 and HTTP proxies. Proxies can be configured globally in the platform settings or overridden for individual site configurations.

### Configuration Hierarchy
1.  **Site-Specific Proxy**: Defined in the `scraper_config` table; takes highest priority.
2.  **Global Proxy**: Set via the `proxy_url` setting in the `settings` table.
3.  **Direct Connection**: Used if neither of the above are provided.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `proxy_url` | String | Empty | SOCKS5 or HTTP proxy URL (e.g., `socks5://user:pass@host:1080`). |
| `use_stealth` | Integer/Bool | 0 (False) | Toggles the application of Playwright Stealth patches. |

Sources: [scraper/scraper.py:41-44](scraper/scraper.py#L41-L44), [scraper/scraper.py:533-548](scraper/scraper.py#L533-L548), [webui/templates/config.html:92-94](webui/templates/config.html#L92-L94)

## Automated Browser Interaction

To further mimic human behavior and trigger lazy-loaded content often hidden behind bot challenges, the system performs simulated interactions.

### Interaction Logic
*  **Cookie Acceptance**: The `accept_cookies` function automatically identifies and clicks common Swedish/English consent buttons (e.g., "Jag förstår", "Acceptera alla").
*  **Simulated Scrolling**: The `_infinite_scroll` and detection scroll logic move the viewport to trigger dynamic content loading while maintaining a human-like pace.
*  **Wait Conditions**: Specifically for enrichment, the system waits for `JSON-LD` Product nodes to be present, ensuring client-side rendered data is captured.

```python
# From scraper/scraper.py:456-466
async def accept_cookies(page):
    """Accept cookie consent dialogs — tries common button texts."""
    for text in ['Jag förstår', 'Acceptera alla', 'Acceptera', 'Accept all', 'Accept']:
        try:
            btn = await page.query_selector(f"button:has-text('{text}')")
            if btn and await btn.is_visible():
                await btn.click()
                await asyncio.sleep(1.5)
                return True
        except PlaywrightError as e:
            logger.debug(f"Cookie button '{text}' not clickable: {e}")
    return False
```

Sources: [scraper/scraper.py:456-466](scraper/scraper.py#L456-L466), [scraper/scraper.py:870-875](scraper/scraper.py#L870-L875), [scraper/enrich.py:61-75](scraper/enrich.py#L61-L75)

## Conclusion
The Stealth Mode and Bot Bypass system is a multi-layered defense against scraper blocking. By combining automated protection detection, fingerprint masking, and proxy-based network rotation, the platform maintains high success rates even against e-commerce sites protected by sophisticated anti-bot services like Akamai and Cloudflare.
