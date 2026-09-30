from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_scraper_webui_uses_shared_avkroken_theme_contract():
    css = read("scraper/webui/static/theme.css")
    js = read("scraper/webui/static/theme.js")
    for name in ("index.html", "config.html"):
        html = read(f"scraper/webui/templates/{name}")
        assert 'data-theme="legacy"' in html
        assert 'data-bs-theme="dark"' in html
        assert html.count('/static/theme.css') == 1
        assert html.count('/static/theme.js') == 1
        assert 'value="legacy">Legacy' in html
        assert 'value="forest">Avkroken' in html
        assert 'value="blackout">Blackout' in html

    assert ':root[data-theme="legacy"]' in css
    assert "rgba(36,231,232,.11)" in css
    assert "rgba(213,29,203,.10)" in css
    assert "background-size:42px 42px" in css
    assert '"avkroken.theme"' in js
    assert '"avkroken_theme"' in js
    assert 'Domain=.denied.se' in js


def test_scraper_old_light_dark_toggle_is_not_active_anymore():
    for name in ("index.html", "config.html"):
        html = read(f"scraper/webui/templates/{name}")
        assert "themeToggle" not in html
        assert "toggleTheme()" not in html
        assert "localStorage.setItem('theme'" not in html
