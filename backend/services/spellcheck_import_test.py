import json

from backend.services.spellcheck_engine import SpellcheckEngine


def test_parse_rules_from_text(tmp_path):
    engine = SpellcheckEngine(user_dict_path=str(tmp_path / "user_dictionary.json"))

    test_text = """
    ("发贴", "发帖", "现代词汇"),
    ("由于", "由于", "白名单测试"),
    错误词 正确词 分类理由
    "引号词", "正确引号", "引号理由"
    """

    rules = engine._parse_text_to_rules(test_text)

    assert len(rules) >= 3
    assert any(r[0] == "发贴" and r[1] == "发帖" for r in rules)
    assert any(r[0] == "错误词" and r[1] == "正确词" for r in rules)
    assert any(r[0] == "引号词" and r[1] == "正确引号" for r in rules)
    assert not any(r[0] == r[1] for r in rules)


def test_hot_update(tmp_path):
    dict_path = tmp_path / "user_dictionary.json"
    engine = SpellcheckEngine(user_dict_path=str(dict_path))
    engine.add_mistake("旧错误", "旧正确", "理由")
    engine.build()

    assert len(engine.check("这是一个旧错误")) > 0

    count = engine.import_from_text('("新错误", "新正确", "热更新理由")')

    results = engine.check("这是一个新错误")
    assert count == 1
    assert len(results) > 0
    assert results[0]["suggestion"] == "新正确"

    persisted = json.loads(dict_path.read_text(encoding="utf-8"))
    assert ["新错误", "新正确", "热更新理由"] in persisted
