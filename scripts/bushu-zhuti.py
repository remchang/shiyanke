# -*- coding: utf-8 -*-
"""部署自定义主题 shiyanke-theme：
1) 复制主题源码到临时目录，把 page-sousuo.hbs 里的 __NEIRONG_API_KEY__ 换成真实 Content API 只读密钥
2) 用 zipfile 打成 Ghost 认可的 zip（顶层就是 package.json）
3) 用管理端会话上传并激活
4) 校验 gscan（可选，部署前先保证源码已通过）
"""
import json
import os
import shutil
import tempfile
import zipfile
import urllib.request
import urllib.parse
import urllib.error
import http.cookiejar
import uuid

ZHANDIAN = "http://127.0.0.1:2368"
YOUXIANG = "admin@shiyanke.local"
MIMA = "Shiyanke@2026"
XIANGMU = r"C:\Users\王锐兵\Doubao\chats\2026-09-03\new-chat\shiyanke"
ZHUTI_YUAN = os.path.join(XIANGMU, "theme", "shiyanke-theme")
MIYAO_WENJIAN = os.path.join(XIANGMU, "runtime", "yunxing", "jicheng-miyao.json")
ZHUTI_MING = "shiyanke-theme"

# 1) 读 Content key
with open(MIYAO_WENJIAN, "r", encoding="utf-8") as f:
    miyao = json.load(f)
neirong_key = miyao["neirongKey"]
print("Content API key:", neirong_key[:12] + "……")

# 2) 复制并替换占位符
linshi = tempfile.mkdtemp(prefix="shiyanke-zhuti-")
zhuti_linshi = os.path.join(linshi, ZHUTI_MING)
shutil.copytree(ZHUTI_YUAN, zhuti_linshi)
sousuo_hbs = os.path.join(zhuti_linshi, "page-sousuo.hbs")
with open(sousuo_hbs, "r", encoding="utf-8") as f:
    neirong = f.read()
assert "__NEIRONG_API_KEY__" in neirong, "占位符不存在，检查 page-sousuo.hbs"
neirong = neirong.replace("__NEIRONG_API_KEY__", neirong_key)
with open(sousuo_hbs, "w", encoding="utf-8") as f:
    f.write(neirong)
print("已把 Content key 写入 page-sousuo.hbs")

# 3) 打包 zip（顶层就是主题文件）
zip_lujing = os.path.join(linshi, ZHUTI_MING + ".zip")
with zipfile.ZipFile(zip_lujing, "w", zipfile.ZIP_DEFLATED) as z:
    for gen, dirs, files in os.walk(zhuti_linshi):
        for wen in files:
            quanlu = os.path.join(gen, wen)
            xiangdui = os.path.relpath(quanlu, zhuti_linshi)
            z.write(quanlu, xiangdui)
print("主题包:", zip_lujing)

# 4) 管理端登录（会话）
beng = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
denglu = urllib.parse.urlencode({"username": YOUXIANG, "password": MIMA}).encode("utf-8")
req = urllib.request.Request(ZHANDIAN + "/ghost/api/admin/session/", data=denglu, method="POST",
    headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json",
             "Origin": ZHANDIAN, "Referer": ZHANDIAN + "/ghost/"})
try:
    with beng.open(req, timeout=30) as resp:
        print("登录:", resp.status)
except urllib.error.HTTPError as cuowu:
    print("登录失败:", cuowu.code, cuowu.read().decode("utf-8")[:200])
    raise SystemExit(1)

# 5) 上传主题（multipart，字段名 file）
def shangchuan(lujing, mubiao):
    bianjie = "----WebKitFormBoundary" + uuid.uuid4().hex
    with open(lujing, "rb") as f:
        wenjian_shuju = f.read()
    ming = os.path.basename(lujing)
    zhengwen = (
        ("--" + bianjie + "\r\n"
         'Content-Disposition: form-data; name="file"; filename="' + ming + '"\r\n'
         "Content-Type: application/zip\r\n\r\n").encode("utf-8")
        + wenjian_shuju
        + ("\r\n--" + bianjie + "--\r\n").encode("utf-8")
    )
    q = urllib.request.Request(ZHANDIAN + mubiao, data=zhengwen, method="POST", headers={
        "Content-Type": "multipart/form-data; boundary=" + bianjie,
        "Accept": "application/json",
        "Origin": ZHANDIAN, "Referer": ZHANDIAN + "/ghost/",
    })
    try:
        with beng.open(q, timeout=120) as resp:
            return resp.status, resp.read().decode("utf-8")[:300]
    except urllib.error.HTTPError as cuowu:
        return cuowu.code, cuowu.read().decode("utf-8")[:300]

def qingqiu(mubiao, fangfa="GET"):
    q = urllib.request.Request(ZHANDIAN + mubiao, method=fangfa, headers={
        "Accept": "application/json", "Origin": ZHANDIAN, "Referer": ZHANDIAN + "/ghost/"})
    try:
        with beng.open(q, timeout=120) as resp:
            return resp.status, resp.read().decode("utf-8")[:300]
    except urllib.error.HTTPError as cuowu:
        return cuowu.code, cuowu.read().decode("utf-8")[:300]

# 先看看当前主题列表
print("当前主题列表:")
print("  ", qingqiu("/ghost/api/admin/themes/")[1])

# 上传
zhuangtai, neirong = shangchuan(zip_lujing, "/ghost/api/admin/themes/upload/")
print("上传主题:", zhuangtai, neirong)

# 激活
zhuangtai2, neirong2 = qingqiu("/ghost/api/admin/themes/%s/activate/" % ZHUTI_MING, "PUT")
print("激活主题:", zhuangtai2, neirong2)

shutil.rmtree(linshi, ignore_errors=True)
