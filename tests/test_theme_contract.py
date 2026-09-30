from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_flask_surfaces_use_shared_avkroken_theme_contract():
    css = read("static/theme.css")
    js = read("static/theme.js")
    for name in ("index.html", "login.html", "signup.html"):
        html = read(f"templates/{name}")
        assert 'data-theme="legacy"' in html
        assert html.count('/static/theme.css') == 1
        assert html.count('/static/theme.js') == 1
        assert 'value="legacy">Legacy' in html
        assert 'value="forest">Avkroken' in html
        assert 'value="blackout">Blackout' in html

    assert ':root[data-theme="legacy"]' in css
    assert ':root[data-theme="forest"]' in css
    assert ':root[data-theme="blackout"]' in css
    assert "rgba(36,231,232,.11)" in css
    assert "rgba(213,29,203,.10)" in css
    assert "background-size:42px 42px" in css
    assert "--accent:" not in css
    assert '"avkroken.theme"' in js
    assert '"avkroken_theme"' in js
    assert 'Domain=.denied.se' in js
    assert 'localStorage.getItem("theme")' in js


def test_old_flask_light_dark_toggle_is_not_active_anymore():
    html = read("templates/index.html")
    assert "toggleTheme()" not in html
    assert "themeBtn" not in html
    assert "localStorage.setItem('theme'" not in html
