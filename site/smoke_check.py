"""CI smoke test: serve the React build under a GitHub Pages-style sub-path and check the offline demo renders.

    cd frontend && npm run build && cd .. && python site/smoke_check.py

Fails if the default draft (the first one with an LLM-as-Judge sample, Kriti Data Labs) does not render with the Al Noor
conflict and the LLM-as-Judge sample, or if the page logs a JavaScript error.
Writes smoke-desktop.png and smoke-mobile.png.
"""
import asyncio
import functools
import http.server
import os
import shutil
import sys
import tempfile
import threading
from pathlib import Path

from playwright.async_api import async_playwright

DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
# Serve under the repo name, like GitHub Pages does (e.g. /atliq-contract-analyzer-v2/).
SUBPATH = os.environ.get("GITHUB_REPOSITORY", "SatishJ12/atliq-contract-analyzer-v2").split("/")[-1]
PORT = 8765


def serve(root: str):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler).serve_forever()


async def check(p, viewport, shot) -> list[str]:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    browser = await p.chromium.launch(**launch)
    page = await browser.new_page(viewport=viewport)
    await page.add_init_script("localStorage.setItem('atliq.apiUrl', 'demo')")
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    # Network failures (e.g. the Google Fonts CDN being blocked) are not app errors.
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console: {m.text}"))
    await page.goto(f"http://127.0.0.1:{PORT}/{SUBPATH}/")
    problems = []
    try:
        await page.get_by_text("Do not sign yet").first.wait_for(timeout=30_000)
    except Exception:
        problems.append("verdict never rendered")
    overflow = await page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    if overflow > 1:
        problems.append(f"page scrolls sideways by {overflow}px at width {viewport['width']}")
    body = await page.inner_text("body")
    for needle in ["Al Noor", "LLM-as-Judge review", "Needs Human Review", "Offline demo"]:
        if needle not in body:
            problems.append(f"missing text: {needle}")
    await page.screenshot(path=shot, full_page=True)
    await browser.close()
    return problems + errors


async def main() -> int:
    if not (DIST / "index.html").exists():
        print("frontend/dist is missing: run `npm run build` in frontend/ first")
        return 1
    root = tempfile.mkdtemp()
    shutil.copytree(DIST, Path(root) / SUBPATH)
    threading.Thread(target=serve, args=(root,), daemon=True).start()
    async with async_playwright() as p:
        problems = await check(p, {"width": 1400, "height": 1000}, "smoke-desktop.png")
        problems += await check(p, {"width": 390, "height": 844}, "smoke-mobile.png")
    if problems:
        print("Smoke test failed:\n- " + "\n- ".join(problems))
        return 1
    print("Smoke test passed: offline demo rendered the default review with the Al Noor conflict and the judge sample.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
