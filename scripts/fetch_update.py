# -*- coding: utf-8 -*-
"""每日开奖数据更新脚本（GitHub Actions 与本地共用）。

官方源优先（带合法 Referer 直连）→ 失败回退 textdb 镜像频道。
合并历史期号，latest-first，最多保留 150 期；仅在内容变化时写盘。

输出 schema：
  data/ssq.json {"game":"ssq","source":...,"updatedAt":...,"rows":[{"issue","date","red":[6],"blue":int}]}
  data/dlt.json {"game":"dlt","source":...,"updatedAt":...,"rows":[{"issue","date","front":[5],"back":[2]}]}
"""
import argparse
import datetime
import json
import os
import re
import sys
import time
import urllib.request

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')
TEXTDB = 'https://textdb.dev/api/data/csq2-lottery-live-2026a1'
MAX_ROWS = 150


def http_text(url, referer=None, timeout=40):
    req = urllib.request.Request(url)
    req.add_header('User-Agent', UA)
    req.add_header('Accept', 'application/json, text/plain, */*')
    req.add_header('Accept-Language', 'zh-CN,zh;q=0.9')
    if referer:
        req.add_header('Referer', referer)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    for enc in ('utf-8', 'gbk'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode('utf-8', 'ignore')


def to_ints(v):
    if v is None:
        return []
    if isinstance(v, str):
        return [int(x) for x in re.split(r'[,\;\s]+', v.strip()) if x]
    return [int(x) for x in v]


def norm_date(s):
    s = (s or '').strip()
    return s[:10] if len(s) >= 10 else s


# ---------------- 官方源 ----------------
def fetch_ssq_official(n=150):
    """福彩官网 findDrawNotice（需 Referer ygkj/wqkjgg/ssq）。"""
    url = ('https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice'
           '?name=ssq&issueCount=%d' % n)
    data = json.loads(http_text(url, 'https://www.cwl.gov.cn/ygkj/wqkjgg/ssq/'))
    rows = []
    for it in (data.get('result') or []):
        red = to_ints(it.get('red'))
        blue = to_ints(it.get('blue'))
        if len(red) == 6 and len(blue) == 1:
            rows.append({'issue': str(it.get('code', '')), 'date': norm_date(it.get('date')),
                         'red': sorted(red), 'blue': blue[0]})
    return rows


def fetch_dlt_official(pages=2):
    """体彩官网 getHistoryPageListV1（需 Referer static.sporttery.cn）。"""
    rows = []
    for p in range(1, pages + 1):
        url = ('https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry'
               '?gameNo=85&provinceId=0&pageSize=100&isVerify=1&pageNo=%d' % p)
        data = json.loads(http_text(url, 'https://static.sporttery.cn/'))
        lst = ((data.get('value') or {}).get('list')) or []
        if not lst:
            break
        for it in lst:
            nums = to_ints(str(it.get('lotteryDrawResult', '')).replace('  ', ' '))
            if len(nums) >= 7:
                rows.append({'issue': str(it.get('lotteryDrawNum', '')),
                             'date': norm_date(it.get('lotteryDrawTime')),
                             'front': sorted(nums[:5]), 'back': sorted(nums[5:7])})
        time.sleep(0.5)
    return rows


# ---------------- textdb 镜像兜底（blue 为数组） ----------------
def fetch_textdb():
    txt = http_text(TEXTDB + '?_=' + str(int(time.time()))).strip()
    if txt.startswith('window.CSQ_LIVE='):
        txt = txt[len('window.CSQ_LIVE='):]
    obj = json.loads(txt)
    games = obj.get('games') or {}
    ssq, dlt = [], []
    for r in games.get('ssq') or []:
        red = to_ints(r.get('red'))
        blue = to_ints(r.get('blue'))
        if len(red) == 6 and blue:
            ssq.append({'issue': str(r.get('issue', '')), 'date': norm_date(r.get('date')),
                        'red': sorted(red), 'blue': blue[0]})
    for r in games.get('dlt') or []:
        front = to_ints(r.get('red', r.get('front')))
        back = to_ints(r.get('blue', r.get('back')))
        if len(front) == 5 and len(back) == 2:
            dlt.append({'issue': str(r.get('issue', '')), 'date': norm_date(r.get('date')),
                        'front': sorted(front), 'back': sorted(back)})
    return ssq, dlt


# ---------------- 合并写盘 ----------------
def merge_rows(old, new, cap=MAX_ROWS):
    m = {}
    for r in (old or []):
        m[str(r['issue'])] = r
    for r in (new or []):
        m[str(r['issue'])] = r
    out = sorted(m.values(), key=lambda r: int(r['issue']), reverse=True)
    return out[:cap]


def load_old(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f).get('rows', [])
    except Exception:
        return []


def write_if_changed(path, payload):
    blob = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    old = None
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                old = f.read()
        except Exception:
            old = None
    if old == blob:
        return False
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(blob)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='data')
    a = ap.parse_args()
    now = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    log = []

    tb_ssq = tb_dlt = None
    for game, fn in (('ssq', fetch_ssq_official), ('dlt', fetch_dlt_official)):
        path = os.path.join(a.out, game + '.json')
        old_rows = load_old(path)
        rows, source = [], ''
        try:
            rows = fn()
            source = 'official'
        except Exception as e:
            log.append('%s: official FAILED %s: %s' % (game, type(e).__name__, e))
        if not rows:
            try:
                if tb_ssq is None and tb_dlt is None:
                    tb_ssq, tb_dlt = fetch_textdb()
                rows = tb_ssq if game == 'ssq' else tb_dlt
                if rows:
                    source = 'textdb-fallback'
            except Exception as e:
                log.append('%s: textdb FAILED %s: %s' % (game, type(e).__name__, e))
        if not rows:
            log.append('%s: no rows fetched, keep %d existing' % (game, len(old_rows)))
            continue
        merged = merge_rows(old_rows, rows)
        changed = write_if_changed(path, {'game': game, 'source': source,
                                          'updatedAt': now, 'rows': merged})
        log.append('%s: source=%s rows=%d latest=%s(%s) changed=%s' %
                   (game, source, len(merged), merged[0]['issue'], merged[0]['date'], changed))
        time.sleep(0.6)
    print('\n'.join(log) if log else 'nothing to do')
    return 0


if __name__ == '__main__':
    sys.exit(main())
