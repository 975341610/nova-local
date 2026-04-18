import pytest
from backend.services.spellcheck_engine import SpellcheckEngine

@pytest.fixture
def engine():
    e = SpellcheckEngine()
    e.build()
    return e

def test_basic_match(engine):
    results = engine.check("的地确确有这回事")
    assert any(r["word"] == "的地确确" and r["suggestion"] == "的确确实" for r in results)

def test_multiple_matches(engine):
    results = engine.check("的地确确再所不惜已经以经")
    words = [r["word"] for r in results]
    assert "的地确确" in words
    assert "再所不惜" in words
    assert "以经" in words

def test_whitelist(engine):
    engine.set_whitelist(["的地确确"])
    results = engine.check("的地确确有这回事")
    assert not any(r["word"] == "的地确确" for r in results)

def test_template_de_de_de(engine):
    results = engine.check("他跑的很快")
    assert any(r["word"] == "的" and r["suggestion"] == "得" for r in results)
    
    # 不应该匹配 “我的很快”
    results = engine.check("我的很快")
    assert not any(r["word"] == "的" and r["suggestion"] == "得" for r in results)

def test_greedy_match(engine):
    # 如果词库有 "已经" 和 "以经"
    # 这里测试重叠匹配
    engine.add_mistake("一二三", "123", "test")
    engine.add_mistake("二三", "23", "test")
    engine.build()
    results = engine.check("一二三四")
    assert len(results) == 1
    assert results[0]["word"] == "一二三"
