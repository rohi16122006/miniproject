import pytest


@pytest.fixture(autouse=True)
def tmp_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DIGITWIN_DB", str(tmp_path / "test.db"))
