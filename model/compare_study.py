"""比较 model/results/study_results.json 与 model/expected/study_results.json（相对误差1e-10）。

用于确认 3.0 对引擎的扩展没有改变 2.0 完整研究的任何结果字段。
"""
import json, math, sys
from pathlib import Path
R = Path(__file__).resolve().parent
new = json.loads((R / 'results/study_results.json').read_text(encoding='utf-8'))
old = json.loads((R / 'expected/study_results.json').read_text(encoding='utf-8'))
count = 0; bad = []


def walk(a, b, path):
    global count
    if isinstance(b, dict):
        if set(a) != set(b): bad.append(path + ' keys'); return
        for k in b: walk(a[k], b[k], path + '.' + k)
    elif isinstance(b, list):
        if len(a) != len(b): bad.append(path + ' len'); return
        for i, (x, y) in enumerate(zip(a, b)): walk(x, y, f'{path}[{i}]')
    elif isinstance(b, (int, float)) and not isinstance(b, bool) and b is not None:
        count += 1
        if a is None or not math.isclose(a, b, rel_tol=1e-10, abs_tol=1e-10): bad.append(f'{path}: {a} / {b}')
    else:
        count += 1
        if a != b: bad.append(f'{path}: {a} / {b}')


walk(new, old, 'study')
if bad:
    print('FAIL', len(bad)); print('\n'.join(bad[:20])); sys.exit(1)
print('PASS study_results vs expected:', count)
