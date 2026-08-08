#!/usr/bin/env python3
"""Build lang/ru.json fast: hand map + batched Google gtx (\\n-joined)."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
zh = json.loads((ROOT / "lang" / "zh.json").read_text(encoding="utf-8"))
en = json.loads((ROOT / "lang" / "en.json").read_text(encoding="utf-8"))
out_path = ROOT / "lang" / "ru.json"
cache_path = ROOT / "lang" / ".ru-cache.json"
cache: dict = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}

cjk = re.compile(r"[\u4e00-\u9fff]")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
BATCH = 25
SEP = "\n monsep \n"  # unlikely in UI strings; google keeps separators roughly

# Import HAND from previous script logic — keep compact set
HAND = {
    "未找到": "Не найдено",
    "未登录": "Не выполнен вход",
    "无权限": "Нет доступа",
    "出错了": "Что-то пошло не так",
    "服务器错误": "Ошибка сервера",
    "服务器内部错误": "Внутренняя ошибка сервера",
    "参数错误": "Неверные параметры",
    "网络错误": "Ошибка сети",
    "登录": "Войти",
    "退出登录": "Выйти",
    "PassPort 登录": "Войти через PassPort",
    "我的组织": "Мои организации",
    "我的任务": "Мои задачи",
    "用户设置": "Настройки пользователя",
    "工作台": "Рабочая область",
    "新建组织": "Новая организация",
    "新建项目": "Новый проект",
    "翻译工作台": "Редактор переводов",
    "源文件": "Исходные файлы",
    "导入": "Импорт",
    "导出": "Экспорт",
    "设置": "Настройки",
    "保存": "Сохранить",
    "取消": "Отмена",
    "确定": "OK",
    "关闭": "Закрыть",
    "删除": "Удалить",
    "搜索": "Поиск",
    "添加": "Добавить",
    "移除": "Убрать",
    "上传": "Загрузить",
    "下载": "Скачать",
    "加载中...": "Загрузка...",
    "处理中...": "Обработка...",
    "保存中...": "Сохранение...",
    "创建中...": "Создание...",
    "上传中...": "Загрузка...",
    "删除中...": "Удаление...",
    "移除中...": "Удаление...",
    "创建失败": "Не удалось создать",
    "保存失败": "Не удалось сохранить",
    "删除失败": "Не удалось удалить",
    "上传失败": "Не удалось загрузить",
    "移除失败": "Не удалось удалить",
    "修改失败": "Не удалось изменить",
    "创建组织": "Создать организацию",
    "创建项目": "Создать проект",
    "删除项目": "Удалить проект",
    "删除文件": "Удалить файл",
    "保存设置": "Сохранить настройки",
    "保存 README": "Сохранить README",
    "组织已更新": "Организация обновлена",
    "项目已更新": "Проект обновлён",
    "README 已更新": "README обновлён",
    "文件已删除": "Файл удалён",
    "角色已更新": "Роль обновлена",
    "添加成员": "Добавить участника",
    "主导航": "Основная навигация",
    "切换深浅色": "Светлая/тёмная тема",
    "切换至浅色": "Светлая тема",
    "切换至暗色": "Тёмная тема",
    "界面语言": "Язык интерфейса",
    "产品能力": "Возможности",
    "翻译收集，像 Crowdin 一样协作": "Сбор переводов — совместная работа как в Crowdin",
    "了解能力": "Подробнее",
    "页面不存在": "Страница не найдена",
    "返回工作台": "К рабочей области",
    "返回项目": "К проекту",
    "暂无简介": "Нет описания",
    "源语言": "Исходный язык",
    "目标语言": "Целевые языки",
    "选择语言…": "Выбрать языки…",
    "选择目标语言": "Выбрать целевые языки",
    "全部语言": "Все языки",
    "已选语言": "Выбранные языки",
    "添加自定义语言": "Добавить свой язык",
    "尚未选择语言": "Языки не выбраны",
    "总览": "Обзор",
    "成员": "Участники",
    "项目": "Проекты",
    "公开": "Публичный",
    "私有": "Приватный",
    "语言": "Языки",
    "进度": "Прогресс",
    "批准": "Утвердить",
    "翻译": "Перевод",
    "审核": "Проверка",
    "列表": "Список",
    "辅助": "Боковая панель",
    "就绪": "Готово",
    "原文": "Оригинал",
    "建议": "Предложения",
    "语境": "Контекст",
    "讨论": "Обсуждение",
    "发送": "Отправить",
    "文件": "Файлы",
    "名称": "Название",
    "打开": "Открыть",
    "编辑": "Изменить",
    "图标": "Иконка",
    "组织": "Организация",
    "新建": "Создать",
    "译者": "Переводчик",
    "审核员": "Редактор",
    "所有者": "Владелец",
    "管理员": "Администратор",
    "访客": "Гость",
    "用户": "Пользователь",
    "角色": "Роль",
    "操作": "Действия",
    "状态": "Статус",
    "待办": "К выполнению",
    "路径": "Путь",
    "版本": "Версия",
    "登录失败：": "Ошибка входа: ",
    "简体中文": "Упрощённый китайский",
    "繁體中文": "Традиционный китайский",
    "英语": "Английский",
    "日语": "Японский",
    "韩语": "Корейский",
    "法语": "Французский",
    "德语": "Немецкий",
    "西班牙语": "Испанский",
    "俄语": "Русский",
    "没有待翻译词条": "Нет строк для перевода",
    "没有待批准词条": "Нет строк для утверждения",
    "没有匹配的字符串": "Нет совпадений",
    "已保存": "Сохранено",
    "审核中": "На проверке",
    "只读": "Только чтение",
    "暂无字符串": "Нет строк",
    "已批准": "Утверждено",
    "有建议": "Есть предложения",
    "未翻译": "Не переведено",
    "将上传 ": "Будет загружено ",
    " 个文件：": " файл(ов):",
    "输入译文…": "Введите перевод…",
    "上一条": "Предыдущая",
    "下一条": "Следующая",
    "设置分区": "Разделы настроек",
    "字符串列表": "Список строк",
    "翻译区": "Область перевода",
    "搜索 key 或源文": "Поиск по key или оригиналу",
}


def pick_source(k: str) -> tuple[str, str]:
    ev = en.get(k)
    if isinstance(ev, str) and ev and not cjk.search(ev) and ev != k:
        return "en", ev
    return "zh-CN", k


def gtx_one(text: str, sl: str) -> str:
    cache_key = f"{sl}|{text}"
    if cache_key in cache:
        return cache[cache_key]
    url = (
        "https://translate.googleapis.com/translate_a/single"
        f"?client=gtx&sl={sl}&tl=ru&dt=t&q={urllib.parse.quote(text)}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                data = json.loads(r.read().decode())
            parts = []
            if data and data[0]:
                for seg in data[0]:
                    if seg and seg[0]:
                        parts.append(seg[0])
            out = "".join(parts) if parts else text
            cache[cache_key] = out
            return out
        except Exception as e:
            time.sleep(0.5 * (attempt + 1))
            last = e
    print("FAIL", text[:40], last, flush=True)
    return text


def gtx_batch(items: list[tuple[str, str, str]]) -> dict[str, str]:
    """items: (key, sl, src_text) all same sl ideally — split by sl."""
    result = {}
    by_sl: dict[str, list[tuple[str, str]]] = {}
    for k, sl, src in items:
        by_sl.setdefault(sl, []).append((k, src))
    for sl, pairs in by_sl.items():
        i = 0
        while i < len(pairs):
            chunk = pairs[i : i + BATCH]
            # filter already cached
            need = []
            for k, src in chunk:
                ck = f"{sl}|{src}"
                if ck in cache:
                    result[k] = cache[ck]
                else:
                    need.append((k, src))
            if need:
                joined = "\n".join(src for _, src in need)
                # single request
                translated = gtx_one(joined, sl)
                # split by newlines — google usually preserves line count
                lines = translated.split("\n")
                if len(lines) == len(need):
                    for (k, src), line in zip(need, lines):
                        result[k] = line
                        cache[f"{sl}|{src}"] = line
                else:
                    # fallback one-by-one
                    for k, src in need:
                        result[k] = gtx_one(src, sl)
                time.sleep(0.15)
            i += BATCH
            if (i // BATCH) % 2 == 0:
                cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return result


def main() -> None:
    keys = list(zh.keys())
    print(f"total keys: {len(keys)}", flush=True)
    ru: dict[str, str] = {}
    todo: list[tuple[str, str, str]] = []
    for k in keys:
        if k in HAND:
            ru[k] = HAND[k]
            continue
        sl, src = pick_source(k)
        ck = f"{sl}|{src}"
        if ck in cache:
            ru[k] = cache[ck]
        elif not re.search(r"[A-Za-z\u0400-\u04FF\u4e00-\u9fff]", src):
            ru[k] = src
        else:
            todo.append((k, sl, src))

    print(f"hand/cache done {len(ru)}, todo MT {len(todo)}", flush=True)
    start = time.time()
    got = gtx_batch(todo)
    ru.update(got)
    # any missing
    for k, sl, src in todo:
        if k not in ru:
            ru[k] = gtx_one(src, sl)

    for k, v in list(ru.items()):
        if isinstance(v, str) and "！" in v:
            ru[k] = v.replace("！", "!")

    ordered = {k: ru.get(k, k) for k in keys}
    out_path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    still_cjk = sum(1 for v in ordered.values() if cjk.search(str(v)))
    print(
        "wrote",
        out_path,
        "keys",
        len(ordered),
        "still_cjk",
        still_cjk,
        "elapsed",
        round(time.time() - start, 1),
        flush=True,
    )
    for k in ("登录", "我的组织", "未找到", "保存", "翻译工作台"):
        print(f"  {k} => {ordered.get(k)}", flush=True)


if __name__ == "__main__":
    main()
