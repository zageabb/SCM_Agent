"""Regression checks for serving SCM Agent below the UDA proxy mount."""

from html.parser import HTMLParser
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "link" and values.get("rel") == "stylesheet":
            self.urls.append(values.get("href") or "")
        if tag == "script" and values.get("src"):
            self.urls.append(values["src"] or "")


def test_local_assets_are_relative_to_the_current_mount() -> None:
    parser = AssetParser()
    parser.feed((ROOT / "index.html").read_text())

    local_urls = [url for url in parser.urls if not url.startswith(("http://", "https://"))]
    assert local_urls
    assert all(url and not url.startswith("/") for url in local_urls)
    assert all((ROOT / url).is_file() for url in local_urls)


def test_browser_data_requests_are_relative_to_the_current_mount() -> None:
    javascript = (ROOT / "app.js").read_text()
    fetch_targets = re.findall(r"fetch\(`?['\"]?([^'\"`)]+)", javascript)

    assert "data/scenarios/index.json" in fetch_targets
    assert all(not target.startswith("/") for target in fetch_targets)


def test_scenario_index_references_existing_relative_files() -> None:
    import json

    index = json.loads((ROOT / "data/scenarios/index.json").read_text())
    assert index
    assert all((ROOT / "data/scenarios" / entry["file"]).is_file() for entry in index)
