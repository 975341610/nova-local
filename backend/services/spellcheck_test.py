import pytest

from backend.services.spellcheck_engine import SpellcheckEngine


@pytest.fixture
def engine(tmp_path):
    e = SpellcheckEngine(user_dict_path=str(tmp_path / "user_dictionary.json"))
    e.build()
    return e


def test_basic_match(engine):
    results = engine.check("这个地确有问题")
    assert any(r["word"] == "地确" and r["suggestion"] == "的确" for r in results)


def test_multiple_matches(engine):
    results = engine.check("地确再所不惜以经")
    words = [r["word"] for r in results]
    assert "地确" in words
    assert "再所不惜" in words
    assert "以经" in words


def test_whitelist(engine):
    engine.set_whitelist(["地确"])
    results = engine.check("这个地确有问题")
    assert not any(r["word"] == "地确" for r in results)


def test_template_de_de_de(engine):
    results = engine.check("他跑的很快")
    assert any(r["word"] == "的" and r["suggestion"] == "得" for r in results)

    results = engine.check("我的很快")
    assert not any(r["word"] == "的" and r["suggestion"] == "得" for r in results)


def test_greedy_match(engine):
    engine.add_mistake("一二三", "123", "test")
    engine.add_mistake("二三", "23", "test")
    engine.build()
    results = engine.check("一二三四")
    assert len(results) == 1
    assert results[0]["word"] == "一二三"
