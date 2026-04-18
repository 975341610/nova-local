import ahocorasick
import re
import json
import os
from pathlib import Path
from typing import List, Dict, Any, Set, Tuple

class SpellcheckEngine:
    """
    纯规则拼写检查引擎，基于 Aho-Corasick 算法与正则表达式。
    支持自定义词库导入与热更新。
    """
    def __init__(self, user_dict_path: str = None):
        self.automaton = ahocorasick.Automaton()
        self.mistakes: Dict[str, Tuple[str, str]] = {} # key: wrong, value: (suggestion, reason)
        self.whitelist: Set[str] = set()
        self._is_built = False
        self.user_dict_path = user_dict_path or str(Path(os.environ.get("DATA_ROOT", ".")) / "user_dictionary.json")
        
        # 内置高频易错词库
        self._load_builtin_rules()
        # 加载用户词库
        self.load_user_rules()

    def _load_builtin_rules(self):
        # 常见别字与混淆词
        rules = [
            ("地确", "的确", "常见别字"),
            ("再所不惜", "在所不惜", "成语固定搭配"),
            ("以经", "已经", "常见别字"),
            ("做为一个", "作为一个", "常见别字"),
            ("的地确确", "的确确实", "常见别字"),
            ("必需", "必须", "混淆（请确认上下文）"),
            ("其它", "其他", "现代用法建议用'其他'指代人和物"),
            ("再接再励", "再接再厉", "成语固定搭配"),
            ("穿流不息", "川流不息", "成语固定搭配"),
            ("莫明其妙", "莫名其妙", "成语固定搭配"),
            ("不假思索", "不假思索", "固定用法"),
            ("不加思索", "不假思索", "成语固定搭配"),
            ("谈笑风声", "谈笑风生", "成语固定搭配"),
            ("人名币", "人民币", "常见别字"),
            ("截止目前", "截至目前", "常见搭配"),
            ("由其是", "尤其是", "常见别字"),
            ("一副药", "一付药", "量词混淆"), # 或反之
            ("反映情况", "反应情况", "建议用'反映'"), # 根据语境
            ("反应", "反映", "混淆（请确认上下文）"),

            # ================= 拼音与输入法常见拼写修正 =================
            ("因该", "应该", "拼写修正"),
            ("那怕", "哪怕", "拼写修正"),
            ("的时侯", "的时候", "拼写修正"),
            ("一顶要", "一定要", "拼写修正"),
            ("不的", "不得", "拼写修正"),
            ("为甚么", "为什么", "拼写修正"),
            ("而己", "而已", "拼写修正"),
            ("甚致", "甚至", "拼写修正"),
            ("的了", "得了", "拼写修正"),
            ("不事", "不是", "拼写修正"),
            ("照像", "照相", "拼写修正"),
            ("大慨", "大概", "拼写修正"),

            # ================= 高频常见别字（音近/形近） =================
            ("帐号", "账号", "常见别字"),
            ("登陆", "登录", "常见别字"),       # 特指IT与互联网系统登录
            ("交待", "交代", "常见别字"),
            ("陷井", "陷阱", "常见别字"),
            ("凑和", "凑合", "常见别字"),
            ("震憾", "震撼", "常见别字"),
            ("坐阵", "坐镇", "常见别字"),
            ("松驰", "松弛", "常见别字"),
            ("九洲", "九州", "常见别字"),
            ("脉膊", "脉搏", "常见别字"),
            ("水笼头", "水龙头", "常见别字"),
            ("家俱", "家具", "常见别字"),
            ("座标", "坐标", "常见别字"),
            ("寒喧", "寒暄", "常见别字"),
            ("蛰伏", "蛰伏", "常见别字"),       # 常常被误写为蜇伏
            ("蜇伏", "蛰伏", "常见别字"),
            ("装祯", "装帧", "常见别字"),
            ("气慨", "气概", "常见别字"),
            ("膺品", "赝品", "常见别字"),
            ("急燥", "急躁", "常见别字"),
            ("发韧", "发轫", "常见别字"),
            ("针贬", "针砭", "常见别字"),
            ("渲泄", "宣泄", "常见别字"),
            ("通谍", "通牒", "常见别字"),
            ("修茸", "修葺", "常见别字"),
            ("寻物启示", "寻物启事", "常见别字"),
            ("招聘启示", "招聘启事", "常见别字"),
            ("反溃", "反馈", "常见别字"),
            ("报消", "报销", "常见别字"),
            ("布署", "部署", "常见别字"),
            ("防碍", "妨碍", "常见别字"),
            ("幅射", "辐射", "常见别字"),
            ("粗旷", "粗犷", "常见别字"),
            ("渡假", "度假", "常见别字"),
            ("侯选人", "候选人", "常见别字"),
            ("大姆指", "大拇指", "常见别字"),
            ("挖墙角", "挖墙脚", "常见别字"),
            ("杀戳", "杀戮", "常见别字"),
            ("重迭", "重叠", "常见别字"),
            ("罗嗦", "啰嗦", "常见别字"),
            ("决窍", "诀窍", "常见别字"),
            ("主旋率", "主旋律", "常见别字"),
            ("杀手剑", "杀手锏", "常见别字"),
            ("带眼镜", "戴眼镜", "常见别字"),
            ("付手", "副手", "常见别字"),
            ("藉贯", "籍贯", "常见别字"),
            ("妥贴", "妥帖", "常见别字"),
            ("幅员", "幅员", "常见别字"),       # 常被写错为复员，此处补充常见的相反纠错
            ("复员辽阔", "幅员辽阔", "常见别字"), 
            ("共商国事", "共商国是", "常见别字"),

            # ================= 成语与固定搭配的易错字 =================
            ("走头无路", "走投无路", "成语固定搭配"),
            ("破斧沉舟", "破釜沉舟", "成语固定搭配"),
            ("不可思异", "不可思议", "成语固定搭配"),
            ("甘败下风", "甘拜下风", "成语固定搭配"),
            ("一诺千斤", "一诺千金", "成语固定搭配"),
            ("无可厚飞", "无可厚非", "成语固定搭配"),
            ("出奇不意", "出其不意", "成语固定搭配"),
            ("黄梁一梦", "黄粱一梦", "成语固定搭配"),
            ("如火如茶", "如火如荼", "成语固定搭配"),
            # "谈笑风声" 已存在
            ("迫不急待", "迫不及待", "成语固定搭配"),
            ("仗义直言", "仗义执言", "成语固定搭配"),
            ("名列前矛", "名列前茅", "成语固定搭配"),
            ("烂竽充数", "滥竽充数", "成语固定搭配"),
            # "穿流不息" 已存在
            ("悬梁刺骨", "悬梁刺股", "成语固定搭配"),
            ("草管人命", "草菅人命", "成语固定搭配"),
            ("默守成规", "墨守成规", "成语固定搭配"),
            ("世外桃园", "世外桃源", "成语固定搭配"),
            ("声名雀起", "声名鹊起", "成语固定搭配"),
            ("提纲携领", "提纲挈领", "成语固定搭配"),
            ("眼花燎乱", "眼花缭乱", "成语固定搭配"),
            ("好高骛远", "好高骛远", "成语固定搭配"),       # 保留正确的，纠正错误的鹜
            ("好高鹜远", "好高骛远", "成语固定搭配"),
            ("趋之若骛", "趋之若鹜", "成语固定搭配"),
            ("不醒人事", "不省人事", "成语固定搭配"),
            # "不加思索" 已存在
            ("不径而走", "不胫而走", "成语固定搭配"),
            ("纷至踏来", "纷至沓来", "成语固定搭配"),
            # "再接再励" 已存在
            ("脍灸人口", "脍炙人口", "成语固定搭配"),
            ("无动于中", "无动于衷", "成语固定搭配"),
            ("一股作气", "一鼓作气", "成语固定搭配"),
            ("张慌失措", "张皇失措", "成语固定搭配"),
            ("萎糜不振", "萎靡不振", "成语固定搭配"),
            ("惹事生非", "惹是生非", "成语固定搭配"),
            ("渊远流长", "源远流长", "成语固定搭配"),
            ("相形见拙", "相形见绌", "成语固定搭配"),
            ("按奈不住", "按捺不住", "成语固定搭配"),
            ("食不裹腹", "食不果腹", "成语固定搭配"),
            ("竭泽而鱼", "竭泽而渔", "成语固定搭配"),
            ("气势凶凶", "气势汹汹", "成语固定搭配"),
            ("美仑美奂", "美轮美奂", "成语固定搭配"),
            ("防范未然", "防患未然", "成语固定搭配"),
            ("鬼鬼崇崇", "鬼鬼祟祟", "成语固定搭配"),
            ("大有稗益", "大有裨益", "成语固定搭配"),
            ("一如继往", "一如既往", "成语固定搭配"),
            ("顶力相助", "鼎力相助", "成语固定搭配"),
            ("鸠占鹊巢", "鸠占鹊巢", "成语固定搭配"),       # 预防错别字
            ("鸠占雀巢", "鸠占鹊巢", "成语固定搭配"),
            ("推心至腹", "推心置腹", "成语固定搭配"),
            ("变本加利", "变本加厉", "成语固定搭配"),
            ("首当其中", "首当其冲", "成语固定搭配")
        ]
        for wrong, suggest, reason in rules:
            self.add_mistake(wrong, suggest, reason)

    def add_mistake(self, wrong: str, suggestion: str, reason: str):
        if not wrong:
            return
        self.mistakes[wrong] = (suggestion, reason)
        self.automaton.add_word(wrong, (wrong, suggestion, reason))
        self._is_built = False

    def set_whitelist(self, words: List[str]):
        self.whitelist.update(words)
        self._is_built = False

    def build(self):
        if not self._is_built:
            self.automaton.make_automaton()
            self._is_built = True

    def load_user_rules(self):
        """加载持久化的用户词库"""
        if os.path.exists(self.user_dict_path):
            try:
                with open(self.user_dict_path, "r", encoding="utf-8") as f:
                    user_rules = json.load(f)
                    for rule in user_rules:
                        # 格式: [wrong, correct, reason]
                        if len(rule) >= 3:
                            self.add_mistake(rule[0], rule[1], rule[2])
            except Exception as e:
                print(f"Error loading user rules: {e}")

    def import_from_text(self, text: str) -> int:
        """
        解析文本并导入规则，实现热更新与持久化。
        返回成功解析的规则数。
        """
        rules = self._parse_text_to_rules(text)
        if not rules:
            return 0
            
        # 1. 更新当前内存引擎
        for wrong, correct, reason in rules:
            self.add_mistake(wrong, correct, reason)
        self.build()
        
        # 2. 持久化（由于是规则文件，通常不大，直接重写）
        # 先读取已有的，合并新来的
        existing_rules = []
        if os.path.exists(self.user_dict_path):
            try:
                with open(self.user_dict_path, "r", encoding="utf-8") as f:
                    existing_rules = json.load(f)
            except:
                pass
        
        # 合并去重（根据错误词）
        seen = {r[0] for r in existing_rules}
        for r in rules:
            if r[0] not in seen:
                existing_rules.append(list(r))
                seen.add(r[0])
        
        try:
            with open(self.user_dict_path, "w", encoding="utf-8") as f:
                json.dump(existing_rules, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving user rules: {e}")
            
        return len(rules)

    def _parse_text_to_rules(self, text: str) -> List[Tuple[str, str, str]]:
        """
        解析多种格式的词库文本。
        支持:
        1. ("发贴", "发帖", "现代词汇"),
        2. 错误词, 正确词, 理由
        3. "引号词", "正确引号", "理由"
        """
        rules = []
        lines = text.split("\n")
        
        # 匹配模式 1: ("a", "b", "c")
        p1 = re.compile(r'\(\s*["\'\(\（]?\s*([^"\'\)\）,，]+)\s*["\'\)\）]?\s*[,，]\s*["\'\(\（]?\s*([^"\'\)\）,，]+)\s*["\'\)\）]?\s*[,，]\s*["\'\(\（]?\s*([^"\'\)\）,，]+)\s*["\'\)\）]?\s*\)')
        # 匹配模式 2/3: a, b, c
        p2 = re.compile(r'["\']?([^"\'\s,，]+)["\']?\s*[,，]\s*["\']?([^"\'\s,，]+)["\']?\s*[,，]\s*["\']?([^"\'\s,，]+)["\']?')

        for line in lines:
            line = line.strip()
            if not line: continue
            
            # 模式 1 优先
            m1 = p1.search(line)
            if m1:
                rules.append((m1.group(1).strip(), m1.group(2).strip(), m1.group(3).strip()))
                continue
                
            # 模式 2/3
            m2 = p2.search(line)
            if m2:
                rules.append((m2.group(1).strip(), m2.group(2).strip(), m2.group(3).strip()))
        
        return rules

    def _is_in_whitelist(self, text: str, start: int, end: int) -> bool:
        """
        更精准的白名单检查：看匹配的位置是否落在任何白名单词汇所在的区间内。
        """
        for white in self.whitelist:
            for m in re.finditer(re.escape(white), text):
                w_start, w_end = m.start(), m.end()
                if w_start <= start and end <= w_end:
                    return True
        return False

    def check(self, text: str) -> List[Dict[str, Any]]:
        if not text:
            return []
        self.build()
            
        results = []
        raw_matches = []
        for end_index, (wrong, suggestion, reason) in self.automaton.iter(text):
            start_index = end_index - len(wrong) + 1
            raw_matches.append((start_index, end_index + 1, wrong, suggestion, reason))
        
        # 贪婪匹配：最长优先
        raw_matches.sort(key=lambda x: (x[0], -(x[1]-x[0])))
        
        last_end = -1
        for start, end, wrong, suggestion, reason in raw_matches:
            if start < last_end:
                continue
            
            if self._is_in_whitelist(text, start, end):
                continue
                
            results.append({
                "word": wrong,
                "suggestion": suggestion,
                "reason": reason,
                "offset": start
            })
            last_end = end

        # 增加模板检查
        results.extend(self._check_templates(text, results))
        results.sort(key=lambda x: x["offset"])
        return results

    def _check_templates(self, text: str, existing_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        template_results = []
        occupied_offsets = {r["offset"] for r in existing_results}
        
        # 1. 动词/形容词 + 的 -> 可能是 '得'
        # 排除掉常见的代词前缀，减少误报
        pronouns = "我你他她它咱们谁这那"
        # 匹配 1-2 个中文字符，但第一个字符不能是代名词
        de_pattern = re.compile(r"([\u4e00-\u9fa5]{1,2})(的)(很|真|太|极|非常|十分)")
        for m in de_pattern.finditer(text):
            prefix = m.group(1)
            # 改进：仅当紧邻 '的' 的那个字符是代词时才跳过
            if prefix[-1] in pronouns:
                continue
            
            offset = m.start(2) # "的" 是第 2 个分组
            if offset not in occupied_offsets:
                template_results.append({
                    "word": "的",
                    "suggestion": "得",
                    "reason": "副词修饰形容词/补语建议用'得'",
                    "offset": offset
                })
                occupied_offsets.add(offset)
        
        return template_results

# 全局单例
spellcheck_engine = SpellcheckEngine()
