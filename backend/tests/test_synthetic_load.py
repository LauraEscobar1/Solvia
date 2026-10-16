import pytest

from app.scripts.synthetic_load import SyntheticLoadError, _ensure_test_database, main


def test_synthetic_data_is_only_generated_in_test_databases() -> None:
    _ensure_test_database("postgresql+asyncpg://solvia:solvia@localhost:5433/solvia_test")

    with pytest.raises(SyntheticLoadError, match="solvia"):
        _ensure_test_database("postgresql+asyncpg://solvia:solvia@localhost:5432/solvia")


async def test_script_refuses_a_non_test_database(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql+asyncpg://solvia:solvia@localhost/solvia")

    assert await main(["--requests", "1"]) == 1
    assert "*_test" in capsys.readouterr().err
