import pytest
from nova_repo.backend.services.spellcheck_engine import SpellcheckEngine
import os
import json

def test_parse_rules_from_text():
    engine = SpellcheckEngine()
    
    # 模拟用户输入的多种格式
    test_text = """
    ("发贴", "发帖", "现代词汇"),
    ("由于", "由于", "白名单测试"),
    错误词, 正确词, 分类理由
    "引号词", "正确引号", "引号理由"
    """
    
    # 我们需要在 engine 中实现这个 parse 逻辑
    # 暂时先写测试预期
    rules = engine._parse_text_to_rules(test_text)
    
    # 预期解析出至少 3 组（忽略白名单或格式不正确的）
    assert len(rules) >= 3
    assert any(r[0] == "发贴" and r[1] == "发帖" for r in rules)
    assert any(r[0] == "错误词" and r[1] == "正确词" for r in rules)
    assert any(r[0] == "引号词" and r[1] == "正确引号" for r in rules)

def test_hot_update():
    engine = SpellcheckEngine()
    engine.add_mistake("旧错误", "旧正确", "理由")
    engine.build()
    
    assert len(engine.check("这是一个旧错误")) > 0
    
    # 模拟导入新规则
    new_text = '("新错误", "新正确", "热更新理由")'
    engine.import_from_text(new_text) # 内部应自动 build
    
    results = engine.check("这是一个新错误")
    assert len(results) > 0
    assert results[0]["suggestion"] == "新正确"
