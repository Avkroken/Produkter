---
title: "SOCKS5/HTTP Proxy Support"
wiki_page_id: "infra-proxy"
---

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [scraper/scraper.py](scraper/scraper.py)
- [webui/templates/config.html](webui/templates/config.html)
- [README.md](README.md)
- [webui/app.py](webui/app.py)
- [scraper/enrich.py](scraper/enrich.py)
- [CHANGELOG.md](CHANGELOG.md)
</details>

# SOCKS5/HTTP Proxy Support

The SOCKS5/HTTP Proxy Support in the Web Scraper Platform provides a robust mechanism for routing scraping traffic through intermediary servers. This feature is primarily intended to bypass IP-based rate limiting or blocking implemented by target e-commerce sites, such as those protected by Akamai or Cloudflare.

The system supports two levels of proxy configuration: a global proxy setting applied to all scraping requests and a per-site configuration that allows specific target sites to use dedicated proxy servers. This flexibility ensures that users can optimize performance and cost by only using proxies where strictly necessary.

Sources: [README.md:16-25](README.md#L16-L25), [scraper/scraper.py:73-77](scraper/scraper.py#L73-L77), [CHANGELOG.md:46-52](CHANGELOG.md#L46-L52)

## Architecture and Configuration

The proxy system is integrated directly into the Playwright-based scraping engine. When a scraping task is initiated, the engine checks for both global and site-specific proxy settings before launching a browser context.

### Configuration Hierarchy
The platform evaluates proxy settings in the following order of precedence:
1.  **Per-Site Proxy:** Defined within a specific `scraper_config` entry.
2.  **Global Proxy:** Defined in the system `settings` table, used if no site-specific proxy is provided.
3.  **Direct Connection:** Used if both settings are empty.

Sources: [scraper/scraper.py:596-613](scraper/scraper.py#L596-L613), [scraper/scraper.py:618-636](scraper/scraper.py#L618-L636)

### Data Flow for Proxy Injection

The following diagram illustrates how proxy settings are retrieved from the database and injected into the Playwright browser context during a scraping run.

```mermaid
flowchart TD
    Start([Start Scraping Job]) --> LoadCFG[Load Site Config]
    LoadCFG --> CheckGlobal[Get Global Proxy Setting]
    CheckGlobal --> CheckSite[Check Site-Specific Proxy]
    
    CheckSite -- Site Proxy Exists --> UseSite[Apply Site Proxy]
    CheckSite -- No Site Proxy --> UseGlobal[Apply Global Proxy]
    
    UseSite --> LaunchCtx[Launch Playwright Context]
    UseGlobal --> LaunchCtx
    
    LaunchCtx --> Navigation[Navigate to Target URL]
    Navigation --> Result([Extraction])
```

*The diagram shows the logic flow for determining which proxy to use for a given scraping worker.*
Sources: [scraper/scraper.py:596-636](scraper/scraper.py#L596-L636)

## Implementation Details

### Browser Context Setup
Proxy settings are applied at the browser context level rather than the browser instance level. This allows different scraping workers (running in parallel) to use different proxies simultaneously within the same Chromium instance.

```python
# scraper/scraper.py:618-636
def _make_proxy(url):
    if not url:
        return None
    display = url.split('@')[-1] if '@' in url else url
    logger.info(f"Using proxy: {display}")
    return {"server": url}

# ... inside worker function ...
site_proxy = _make_proxy(cfg.get('proxy_url') or global_proxy_url)
context = await browser.new_context(
    # ... headers ...
    proxy=site_proxy,
)
```

Sources: [scraper/scraper.py:603-608](scraper/scraper.py#L603-L608), [scraper/scraper.py:623-636](scraper/scraper.py#L623-L636)

### Database Schema Support
Proxy information is stored in both the `scraper_config` table (for per-site overrides) and the `settings` table (for global defaults).

| Table | Field | Type | Description |
|-------|-------|------|-------------|
| `scraper_config` | `proxy_url` | TEXT | Specific proxy for this site configuration. |
| `settings` | `proxy_url` (key) | TEXT | The global default proxy URL. |

Sources: [README.md:183-205](README.md#L183-L205), [scraper/scraper.py:228-232](scraper/scraper.py#L228-L232)

## Web Interface Integration

The WebUI provides two interfaces for managing proxy settings:
*  **Advanced Settings:** Allows users to set the global `proxy_url` (e.g., `socks5://user:pass@host:1080`).
*  **Configuration Form:** Provides a field to enter a "Proxy URL (optional)" when adding or editing a site.

Sources: [webui/templates/config.html:86-89](webui/templates/config.html#L86-L89), [webui/templates/config.html:150-153](webui/templates/config.html#L150-L153)

### Proxy Configuration Workflow

```mermaid
sequenceDiagram
    participant User as User (WebUI)
    participant WebUI as WebUI Server
    participant Engine as Scraper Engine
    participant DB as PostgreSQL
    
    User->>WebUI: Enter Proxy URL in Config
    WebUI->>Engine: PUT /api/configs/{id}
    Engine->>DB: UPDATE scraper_config SET proxy_url = ...
    DB-->>Engine: Success
    Engine-->>WebUI: Success
    WebUI-->>User: Show "Setting saved" Toast
```

*This sequence shows the process of updating a proxy configuration via the web interface.*
Sources: [webui/app.py:255-263](webui/app.py#L255-L263), [webui/templates/config.html:247-270](webui/templates/config.html#L247-L270), [scraper/scraper.py:530-558](scraper/scraper.py#L530-L558)

## Technical Specifications

### Supported Proxy Formats
The platform utilizes Playwright's proxy capabilities, supporting standard URI formats:
*  **SOCKS5:** `socks5://user:pass@host:port`
*  **HTTP:** `http://user:pass@host:port`

Sources: [scraper/scraper.py:73-77](scraper/scraper.py#L73-L77)

### Key Functions and API Endpoints

| Component | Identifier | Description |
|-----------|------------|-------------|
| Scraper Engine | `_make_proxy(url)` | Internal helper to format proxy strings for Playwright. |
| Scraper Engine | `get_setting('proxy_url')` | Retrieves the global proxy configuration from the database. |
| WebUI API | `PUT /api/settings/proxy_url` | Endpoint to update the global proxy setting. |
| Scraper Config | `cfg.get('proxy_url')` | Accesses the site-specific proxy override in the worker loop. |

Sources: [scraper/scraper.py:166-180](scraper/scraper.py#L166-L180), [scraper/scraper.py:603-608](scraper/scraper.py#L603-L608), [webui/app.py:266-274](webui/app.py#L266-L274)

## Summary
The proxy support system is a critical component for ensuring high availability and reliability when scraping modern e-commerce websites. By combining global defaults with per-site overrides, the platform provides granular control over network traffic, allowing users to navigate bot protections and IP bans effectively.
Sources: [README.md:16-25](README.md#L16-L25), [scraper/scraper.py:73-77](scraper/scraper.py#L73-L77)
