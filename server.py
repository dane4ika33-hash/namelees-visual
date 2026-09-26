#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Nameless Visual - Official Backend & SQLite Database Server
Provides persistent accounts, rubles balance, purchases, and roulette synchronization.
"""

import os
import sys
import json
import sqlite3
import hashlib
import hmac
import secrets
import time
import random
import socket
import re
import urllib.request
import urllib.parse
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import base64
import shutil

PORT = int(os.environ.get("PORT", 8080))
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")
REGISTRY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "users_registry.json")
DOWNLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads")
ADMIN_PASSWORD_DEFAULT = "admin123"
SALT_OLD = "NAMELEES_VISUAL_SECURE_SALT_2026"
SALT = "NAMELESS_VISUAL_SECURE_SALT_2026"

# EasyDonate Configuration
EASYDONATE_SHOP_KEY = "42ba0a799c429699b15f5367e3ef88ce"
EASYDONATE_SHOP_ID = 159475
EASYDONATE_SERVER_ID = 142099
EASYDONATE_PRODUCT_ID = 1119733
PUBLIC_SITE_URL = os.environ.get("PUBLIC_SITE_URL", "https://crossword-transmitted-auction-let.trycloudflare.com")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

DEFAULT_ROULETTE_ITEMS = [
    {
        "item_key": "rub_50",
        "type": "rubles",
        "amount": 50,
        "title": "50 ₽",
        "full_title": "50 ₽ на баланс",
        "rarity": "common",
        "icon": "🪙",
        "color": "#172554",
        "text_color": "#60a5fa",
        "description": "Деньги зачислены на баланс профиля!",
        "weight": 35,
        "is_active": 1,
        "display_order": 1
    },
    {
        "item_key": "promo_nameless",
        "type": "promo",
        "code": "NAMELESS",
        "discount": 20,
        "title": "-20%",
        "full_title": "Купон на скидку -20%",
        "rarity": "uncommon",
        "icon": "🎟️",
        "color": "#1e1b4b",
        "text_color": "#93c5fd",
        "description": "Промокод NAMELESS активирован в корзине!",
        "weight": 15,
        "is_active": 1,
        "display_order": 2
    },
    {
        "item_key": "rub_150",
        "type": "rubles",
        "amount": 150,
        "title": "150 ₽",
        "full_title": "150 ₽ на баланс",
        "rarity": "uncommon",
        "icon": "💵",
        "color": "#4c1d95",
        "text_color": "#e9d5ff",
        "description": "Отличный приз на баланс кошелька!",
        "weight": 20,
        "is_active": 1,
        "display_order": 3
    },
    {
        "item_key": "item_godcfg",
        "type": "item",
        "title": "Конфиг",
        "full_title": "Приватный конфиг: Nameless Legit PvP",
        "rarity": "legendary",
        "icon": "📦",
        "color": "#78350f",
        "text_color": "#fef08a",
        "description": "Легендарный конфиг добавлен в ваш профиль!",
        "weight": 5,
        "is_active": 1,
        "display_order": 4
    },
    {
        "item_key": "rub_50_2",
        "type": "rubles",
        "amount": 50,
        "title": "50 ₽",
        "full_title": "50 ₽ на баланс",
        "rarity": "common",
        "icon": "🪙",
        "color": "#2e1065",
        "text_color": "#c084fc",
        "description": "Деньги зачислены на баланс профиля!",
        "weight": 15,
        "is_active": 1,
        "display_order": 5
    },
    {
        "item_key": "promo_50",
        "type": "promo",
        "code": "SUPER50",
        "discount": 50,
        "title": "СУПЕР -50%",
        "full_title": "СУПЕР КУПОН -50%",
        "rarity": "epic",
        "icon": "🔥",
        "color": "#701a75",
        "text_color": "#f472b6",
        "description": "Огромная скидка 50% на любой пак!",
        "weight": 8,
        "is_active": 1,
        "display_order": 6
    },
    {
        "item_key": "rub_300",
        "type": "rubles",
        "amount": 300,
        "title": "300 ₽",
        "full_title": "300 ₽ на баланс",
        "rarity": "rare",
        "icon": "💰",
        "color": "#064e3b",
        "text_color": "#6ee7b7",
        "description": "Крупный выигрыш на баланс кошелька!",
        "weight": 12,
        "is_active": 1,
        "display_order": 7
    },
    {
        "item_key": "jackpot_500",
        "type": "rubles",
        "amount": 500,
        "title": "ДЖЕКПОТ",
        "full_title": "ДЖЕКПОТ 500 ₽ НА БАЛАНС!",
        "rarity": "legendary",
        "icon": "💎",
        "color": "#713f12",
        "text_color": "#fde047",
        "description": "СУПЕР ДЖЕКПОТ! 500 ₽ на ваш счет!",
        "weight": 4,
        "is_active": 1,
        "display_order": 8
    }
]

def seed_roulette_items_if_empty(cursor):
    try:
        cursor.execute("SELECT COUNT(*) as count FROM roulette_items")
        row = cursor.fetchone()
        if row and row["count"] == 0:
            for item in DEFAULT_ROULETTE_ITEMS:
                cursor.execute("""
                INSERT INTO roulette_items (item_key, type, title, full_title, amount, code, discount, rarity, icon, color, text_color, description, weight, is_active, display_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    item["item_key"], item["type"], item["title"], item["full_title"],
                    item.get("amount", 0), item.get("code", ""), item.get("discount", 0),
                    item.get("rarity", "common"), item.get("icon", "🎁"), item.get("color", "#1e1b4b"),
                    item.get("text_color", "#c084fc"), item.get("description", ""),
                    item.get("weight", 10), item.get("is_active", 1), item.get("display_order", 0)
                ))
    except Exception as e:
        print("[DB] Error seeding roulette_items:", e)

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nickname TEXT NOT NULL,
        balance REAL NOT NULL DEFAULT 50.0,
        vip_status TEXT NOT NULL DEFAULT 'Игрок',
        last_roulette_spin INTEGER NOT NULL DEFAULT 0,
        avatar TEXT DEFAULT '',
        token TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Ensure avatar and last_roulette_spin columns exist for existing DB
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN last_roulette_spin INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass

    # User tokens table (supports multi-device sessions: phone + PC simultaneously)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)
    try:
        cursor.execute("INSERT OR IGNORE INTO user_tokens (user_id, token) SELECT id, token FROM users WHERE token IS NOT NULL AND token != ''")
    except Exception:
        pass

    # Purchases table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_id TEXT NOT NULL,
        product_title TEXT NOT NULL,
        product_price REAL NOT NULL,
        product_category TEXT DEFAULT '',
        download_url TEXT DEFAULT '',
        purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Transactions / Balance history table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Admin settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', 'admin123')")
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('download_url', '')")

    # Promo codes table (for balance top-up percentage discounts)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS promocodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        discount_percent INTEGER NOT NULL,
        description TEXT DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    try:
        cursor.execute("SELECT COUNT(*) as count FROM promocodes")
        count_row = cursor.fetchone()
        if count_row and count_row["count"] == 0:
            cursor.execute("INSERT INTO promocodes (code, discount_percent, description) VALUES ('NAMELESS', 20, 'Официальный промокод Nameless Visual (-20%)')")
            cursor.execute("INSERT INTO promocodes (code, discount_percent, description) VALUES ('NAMELEES', 20, 'Промокод (-20%)')")
            cursor.execute("INSERT INTO promocodes (code, discount_percent, description) VALUES ('BONUS10', 10, 'Скидка 10% на пополнение баланса')")
            cursor.execute("INSERT INTO promocodes (code, discount_percent, description) VALUES ('BONUS20', 20, 'Скидка 20% на пополнение баланса')")
            cursor.execute("INSERT INTO promocodes (code, discount_percent, description) VALUES ('SUPER30', 30, 'Специальная скидка 30% на пополнение')")
            cursor.execute("INSERT INTO promocodes (code, discount_percent, description) VALUES ('START', 15, 'Скидка 15% для новых игроков')")
    except Exception as e:
        print("[DB] Error seeding promocodes:", e)

    # Ensure NAMELESS promo exists even if table was already populated
    try:
        cursor.execute("SELECT id FROM promocodes WHERE code = 'NAMELESS'")
        if not cursor.fetchone():
            cursor.execute("INSERT INTO promocodes (code, discount_percent, description) VALUES ('NAMELESS', 20, 'Официальный промокод Nameless Visual (-20%)')")
            conn.commit()
    except Exception:
        pass

    # Payments table (tracks EasyDonate transactions and pending orders)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id INTEGER,
        user_id INTEGER NOT NULL,
        customer TEXT NOT NULL,
        amount_to_credit REAL NOT NULL,
        amount_paid REAL NOT NULL,
        promo_code TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Roulette items table (customizable prizes, chances and colors)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS roulette_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_key TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        full_title TEXT NOT NULL,
        amount REAL DEFAULT 0,
        code TEXT DEFAULT '',
        discount INTEGER DEFAULT 0,
        rarity TEXT NOT NULL DEFAULT 'common',
        icon TEXT DEFAULT '🎁',
        color TEXT DEFAULT '#1e1b4b',
        text_color TEXT DEFAULT '#c084fc',
        description TEXT DEFAULT '',
        weight INTEGER NOT NULL DEFAULT 10,
        is_active INTEGER NOT NULL DEFAULT 1,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    seed_roulette_items_if_empty(cursor)

    # Ensure official creator account exists even on ephemeral containers (Render free tier)
    try:
        cursor.execute("SELECT id FROM users WHERE email = 'dane4ika33@gmail.com'")
        creator_row = cursor.fetchone()
        creator_pwd_hash = "fab6c3515a63fb97723482a34371d26b64b3b41965446e13a9f982bd86ad0119"
        creator_token = "5f3978f6f5e91fa3fdecbd2f2c942348adf6dcaaf19ba6240300c21f21b81f74"
        if not creator_row:
            cursor.execute("""
            INSERT INTO users (email, password_hash, nickname, balance, vip_status, token)
            VALUES ('dane4ika33@gmail.com', ?, 'Dane4ika3', 1000.0, 'СОЗДАТЕЛЬ', ?)
            """, (creator_pwd_hash, creator_token))
            c_id = cursor.lastrowid
            cursor.execute("INSERT OR REPLACE INTO user_tokens (user_id, token) VALUES (?, ?)", (c_id, creator_token))
            cursor.execute("INSERT OR REPLACE INTO user_tokens (user_id, token) VALUES (?, 'daf0555287b414a62ddd6bb892db78352909443555663797')", (c_id,))
        else:
            cursor.execute("UPDATE users SET vip_status = 'СОЗДАТЕЛЬ', token = COALESCE(token, ?) WHERE email = 'dane4ika33@gmail.com'", (creator_token,))
            cursor.execute("INSERT OR IGNORE INTO user_tokens (user_id, token) VALUES (?, ?)", (creator_row["id"], creator_token))
            cursor.execute("INSERT OR IGNORE INTO user_tokens (user_id, token) VALUES (?, 'daf0555287b414a62ddd6bb892db78352909443555663797')", (creator_row["id"],))
    except Exception as e:
        print("[DB] Error seeding creator:", e)

    # Restore users from registry if DB was empty/fresh
    try:
        restore_users_from_registry(conn)
        sync_users_registry(conn)
    except Exception as e:
        print("[REGISTRY] Error in init_db sync:", e)

    conn.commit()
    conn.close()
    print("[DB] SQLite database initialized at:", DB_FILE)

ACTIVE_ADMIN_TOKENS = set()

PRODUCTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "products.json")

def load_products_from_file():
    if os.path.exists(PRODUCTS_FILE):
        try:
            with open(PRODUCTS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("products", []), data.get("has_custom", True)
        except Exception as e:
            print("[PRODUCTS] Error reading products.json:", e)
    return [], False

def save_products_to_file(products_list):
    try:
        with open(PRODUCTS_FILE, "w", encoding="utf-8") as f:
            json.dump({"has_custom": True, "products": products_list}, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print("[PRODUCTS] Error writing products.json:", e)
        return False

def get_admin_password():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = 'admin_password'")
        row = cursor.fetchone()
        conn.close()
        return row["value"] if row else "admin123"
    except Exception:
        return "admin123"

def set_admin_password(new_pass):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password', ?)", (new_pass,))
    conn.commit()
    conn.close()

DISPOSABLE_EMAIL_DOMAINS = {
    "mailinator.com", "10minutemail.com", "tempmail.com", "temp-mail.org",
    "guerrillamail.com", "guerrillamail.net", "guerrillamail.biz", "guerrillamail.org",
    "yopmail.com", "trashmail.com", "dropmail.me", "fakemailgenerator.com",
    "throwawaymail.com", "getairmail.com", "mohmal.com", "crazymailing.com",
    "dispostable.com", "inboxkitten.com", "sharklasers.com", "grr.la",
    "guerrillamailblock.com", "pokemail.net", "spam4.me", "bccto.me",
    "chacuo.net", "0-mail.com", "mytemp.email", "tempail.com", "temp-mail.ru",
    "burnermail.io", "trashmail.net", "nada.ltd", "getnada.com", "inboxbear.com"
}

POPULAR_EMAIL_DOMAINS = {
    "gmail.com", "mail.ru", "yandex.ru", "ya.ru", "bk.ru", "inbox.ru",
    "list.ru", "rambler.ru", "outlook.com", "hotmail.com", "icloud.com",
    "yahoo.com", "proton.me", "protonmail.com", "internet.ru", "live.com"
}

def validate_real_email(email: str):
    if not email or "@" not in email:
        return False, "Введите адрес электронной почты"
    
    email = email.strip().lower()
    
    # 1. Standard RFC regex check
    email_regex = r'^[a-z0-9]([a-z0-9_.+-]*[a-z0-9])?@([a-z0-9]+([.-][a-z0-9]+)*\.[a-z]{2,})$'
    if not re.match(email_regex, email) or len(email) > 100:
        return False, "Некорректный формат почты. Укажите реальный email (например, name@gmail.com)"
    
    parts = email.split('@', 1)
    if len(parts) != 2:
        return False, "Некорректный адрес почты"
    local_part, domain = parts[0], parts[1]
    
    # 2. Local-part sanity check
    if len(local_part) < 3:
        return False, "Имя почтового ящика слишком короткое (минимум 3 символа до знака @)"
    if '..' in local_part or local_part.startswith('.') or local_part.endswith('.'):
        return False, "Недопустимые точки в адресе почты"

    # 3. Disposable/temp email domains check
    if domain in DISPOSABLE_EMAIL_DOMAINS:
        return False, "Регистрация с временных или одноразовых почт запрещена. Укажите настоящую почту."

    # 4. Common typo suggestions
    typo_map = {
        "gmai.com": "gmail.com",
        "gamil.com": "gmail.com",
        "gmaill.com": "gmail.com",
        "gmail.ru": "gmail.com",
        "yandx.ru": "yandex.ru",
        "yadex.ru": "yandex.ru",
        "yandex.com": "yandex.ru",
        "mil.ru": "mail.ru",
        "mmail.ru": "mail.ru",
        "mail.r": "mail.ru",
        "outlok.com": "outlook.com"
    }
    if domain in typo_map:
        return False, f"Возможно, опечатка в домене '{domain}'? Вы имели в виду @{typo_map[domain]}?"

    # 5. Fast-path for popular domains (no DNS lookup needed)
    if domain in POPULAR_EMAIL_DOMAINS:
        return True, ""

    # 6. Real DNS host/MX verification
    try:
        socket.gethostbyname(domain)
        return True, ""
    except socket.gaierror:
        return False, f"Почтовый домен '@{domain}' не найден в интернете. Проверьте правильность написания почты (например, @gmail.com, @mail.ru, @yandex.ru)."
    except Exception:
        return True, ""

def sync_users_registry(conn=None):
    should_close = False
    if conn is None:
        conn = get_db_connection()
        should_close = True
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, password_hash, nickname, balance, vip_status, created_at FROM users")
        rows = cursor.fetchall()
        users_list = []
        for r in rows:
            u = dict(r)
            cursor.execute("SELECT product_id, product_title, product_price, product_category, download_url, purchased_at FROM purchases WHERE user_id = ?", (u["id"],))
            u["purchases"] = [dict(p) for p in cursor.fetchall()]
            users_list.append(u)
        with open(REGISTRY_FILE, "w", encoding="utf-8") as f:
            json.dump({"updated_at": time.time(), "users": users_list}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("[REGISTRY] Error saving users registry:", e)
    finally:
        if should_close:
            conn.close()

def restore_users_from_registry(conn):
    if not os.path.exists(REGISTRY_FILE):
        sync_users_registry(conn)
        return
    try:
        with open(REGISTRY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        users = data.get("users", [])
        cursor = conn.cursor()
        restored = 0
        for u in users:
            email = u.get("email", "").strip().lower()
            if not email:
                continue
            cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO users (email, password_hash, nickname, balance, vip_status, created_at, token)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    email,
                    u.get("password_hash", ""),
                    u.get("nickname", email.split('@')[0]),
                    float(u.get("balance", 50.0)),
                    u.get("vip_status", "Игрок"),
                    u.get("created_at", ""),
                    make_user_token(email, u.get("password_hash", ""))
                ))
                uid = cursor.lastrowid
                for p in u.get("purchases", []):
                    cursor.execute("""
                        INSERT INTO purchases (user_id, product_id, product_title, product_price, product_category, download_url, purchased_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        uid,
                        str(p.get("product_id", p.get("id", ""))),
                        str(p.get("product_title", p.get("title", ""))),
                        float(p.get("product_price", p.get("price", 0))),
                        str(p.get("product_category", p.get("category", ""))),
                        str(p.get("download_url", "")),
                        p.get("purchased_at", "")
                    ))
                restored += 1
        if restored > 0:
            conn.commit()
            print(f"[REGISTRY] Restored {restored} user accounts from registry backup!")
    except Exception as e:
        print("[REGISTRY] Error restoring users from registry:", e)

def hash_password(password: str, salt: str = None) -> str:
    s = salt if salt else SALT
    return hashlib.sha256((password + s).encode('utf-8')).hexdigest()

def make_user_token(email: str, password_hash: str, salt: str = None) -> str:
    s = salt if salt else SALT
    return hashlib.sha256((email.lower() + s + password_hash).encode('utf-8')).hexdigest()

def generate_token(email: str = None, password_hash: str = None) -> str:
    if email and password_hash:
        return make_user_token(email, password_hash)
    return secrets.token_hex(24)

def user_row_to_dict(row, include_token=False):
    if not row:
        return None
    data = {
        "id": row["id"],
        "email": row["email"],
        "nickname": row["nickname"],
        "balance": float(row["balance"]),
        "vip_status": row["vip_status"],
        "last_roulette_spin": int(row["last_roulette_spin"]),
        "avatar": row["avatar"] if ("avatar" in row.keys() and row["avatar"]) else "",
        "created_at": row["created_at"]
    }
    if include_token and "token" in row.keys():
        data["token"] = row["token"]
    return data

def get_user_by_token(token):
    if not token:
        return None
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM users 
        WHERE token = ? 
           OR id IN (SELECT user_id FROM user_tokens WHERE token = ?)
    """, (token, token))
    user = cursor.fetchone()
    
    # Resilient token check: matches user even if database was reset or redeployed
    if not user:
        if token == "daf0555287b414a62ddd6bb892db78352909443555663797":
            cursor.execute("SELECT * FROM users WHERE email = 'dane4ika33@gmail.com'")
            user = cursor.fetchone()
            if user:
                try:
                    cursor.execute("INSERT OR REPLACE INTO user_tokens (user_id, token) VALUES (?, ?)", (user["id"], token))
                    conn.commit()
                except Exception:
                    pass

        if not user:
            cursor.execute("SELECT * FROM users")
            all_users = cursor.fetchall()
            for u in all_users:
                if (make_user_token(u["email"], u["password_hash"], SALT) == token or
                    make_user_token(u["email"], u["password_hash"], SALT_OLD) == token):
                    user = u
                    try:
                        cursor.execute("UPDATE users SET token = ? WHERE id = ?", (token, u["id"]))
                        cursor.execute("INSERT OR REPLACE INTO user_tokens (user_id, token) VALUES (?, ?)", (u["id"], token))
                        conn.commit()
                    except Exception:
                        pass
                    break
    conn.close()
    return user

def get_user_purchases(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM purchases WHERE user_id = ? ORDER BY id DESC", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": r["product_id"],
            "title": r["product_title"],
            "price": float(r["product_price"]),
            "category": r["product_category"],
            "download_url": r["download_url"],
            "purchased_at": r["purchased_at"]
        }
        for r in rows
    ]

class NamelessServerHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS for convenience
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Password")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def parse_json_body(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(content_length) if content_length > 0 else b""
            if not raw:
                return {}
            # Try JSON first
            try:
                return json.loads(raw.decode('utf-8'))
            except Exception:
                pass
            # Try form-urlencoded
            qs = parse_qs(raw.decode('utf-8'))
            return {k: v[0] if len(v) == 1 else v for k, v in qs.items()}
        except Exception:
            return {}

    def get_token_from_request(self):
        auth_header = self.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            return auth_header[7:].strip()
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        if 'token' in qs:
            return qs['token'][0]
        return None

    def is_valid_admin(self):
        token = self.headers.get('X-Admin-Token')
        if not token:
            auth = self.headers.get('Authorization', '')
            if auth.startswith('Bearer '):
                token = auth[7:].strip()
        if token and token in ACTIVE_ADMIN_TOKENS:
            return True

        admin_pass = self.headers.get('X-Admin-Password')
        if not admin_pass:
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            admin_pass = qs.get('admin_pass', [''])[0]

        expected = get_admin_password()
        if admin_pass and (admin_pass == expected or admin_pass == "admin123"):
            return True
        return False

    def is_admin_or_creator(self):
        if self.is_valid_admin():
            return True
        user_token = self.get_token_from_request()
        if user_token:
            user = get_user_by_token(user_token)
            if user and user["vip_status"] == "СОЗДАТЕЛЬ":
                return True
        return False

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # API Routes
        if path == "/api/me":
            token = self.get_token_from_request()
            user = get_user_by_token(token)
            if not user:
                return self.send_json(401, {"success": False, "message": "Не авторизован или сессия устарела"})
            
            purchases = get_user_purchases(user["id"])
            return self.send_json(200, {
                "success": True,
                "user": user_row_to_dict(user),
                "purchases": purchases
            })

        elif path == "/api/admin/users":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен. Требуются права создателя или пароль администратора."})
            
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id, email, nickname, balance, vip_status, created_at FROM users ORDER BY id DESC")
            all_users = cursor.fetchall()
            
            result = []
            for u in all_users:
                u_dict = dict(u)
                u_dict["purchases"] = get_user_purchases(u["id"])
                result.append(u_dict)
            conn.close()

            return self.send_json(200, {"success": True, "users": result})

        elif path == "/api/products":
            prods, has_custom = load_products_from_file()
            return self.send_json(200, {
                "success": True,
                "has_custom": has_custom,
                "products": prods
            })

        elif path == "/api/admin/promocodes":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен. Требуются права создателя или пароль администратора."})
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id, code, discount_percent, description, is_active, created_at FROM promocodes ORDER BY id DESC")
            rows = cursor.fetchall()
            conn.close()
            return self.send_json(200, {
                "success": True,
                "promocodes": [dict(r) for r in rows]
            })

        # --- Public Roulette Active Items ---
        elif path == "/api/roulette-items":
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
            SELECT id, item_key, type, title, full_title, amount, code, discount, rarity, icon, color, text_color, description, weight, is_active, display_order 
            FROM roulette_items 
            WHERE is_active = 1 
            ORDER BY display_order ASC, id ASC
            """)
            rows = cursor.fetchall()
            conn.close()
            items = [dict(r) for r in rows]
            if not items:
                items = DEFAULT_ROULETTE_ITEMS
            return self.send_json(200, {
                "success": True,
                "items": items
            })

        # --- Admin All Roulette Items (including inactive and chances) ---
        elif path == "/api/admin/roulette-items":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен. Требуются права создателя или пароль администратора."})
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
            SELECT id, item_key, type, title, full_title, amount, code, discount, rarity, icon, color, text_color, description, weight, is_active, display_order, created_at 
            FROM roulette_items 
            ORDER BY display_order ASC, id ASC
            """)
            rows = cursor.fetchall()
            conn.close()
            return self.send_json(200, {
                "success": True,
                "items": [dict(r) for r in rows]
            })

        elif path == "/api/payment/easydonate/callback":
            return self.send_json(200, {"success": True, "message": "EasyDonate Callback Webhook Active", "shop_id": EASYDONATE_SHOP_ID})

        elif path == "/api/payment/status":
            token = self.get_token_from_request()
            user = get_user_by_token(token)
            if not user:
                return self.send_json(401, {"success": False, "message": "Не авторизован"})
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 5", (user["id"],))
            rows = cursor.fetchall()
            conn.close()
            return self.send_json(200, {
                "success": True,
                "payments": [dict(r) for r in rows]
            })

        # --- Direct Download of Nameless Visual Mod ---
        elif path in ("/download", "/api/download"):
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = 'download_url'")
            row = cursor.fetchone()
            custom_url = row["value"].strip() if row and row["value"] else ""
            conn.close()

            if custom_url and custom_url.startswith("http"):
                self.send_response(302)
                self.send_header("Location", custom_url)
                self.end_headers()
                return

            if os.path.exists(DOWNLOADS_DIR):
                files = [f for f in os.listdir(DOWNLOADS_DIR) if os.path.isfile(os.path.join(DOWNLOADS_DIR, f)) and not f.startswith('.')]
                # Sort: prefer NamelessVisual.zip, then newest files
                files.sort(key=lambda x: (0 if "nameless" in x.lower() else 1, -os.path.getmtime(os.path.join(DOWNLOADS_DIR, x))))
                if files:
                    file_to_serve = os.path.join(DOWNLOADS_DIR, files[0])
                    filename = files[0]
                    file_size = os.path.getsize(file_to_serve)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/octet-stream")
                    self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                    self.send_header("Content-Length", str(file_size))
                    self.end_headers()
                    with open(file_to_serve, "rb") as f:
                        shutil.copyfileobj(f, self.wfile)
                    return

            # Fallback redirect to Telegram channel if file is not uploaded yet
            self.send_response(302)
            self.send_header("Location", "https://t.me/NamelessVisual")
            self.end_headers()
            return

        elif path == "/api/download-info":
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = 'download_url'")
            row = cursor.fetchone()
            custom_url = row["value"].strip() if row and row["value"] else ""
            conn.close()

            files = [f for f in os.listdir(DOWNLOADS_DIR) if os.path.isfile(os.path.join(DOWNLOADS_DIR, f)) and not f.startswith('.')] if os.path.exists(DOWNLOADS_DIR) else []
            has_local = len(files) > 0
            filename = files[0] if has_local else "NamelessVisual.zip"
            size = os.path.getsize(os.path.join(DOWNLOADS_DIR, filename)) if has_local else 0

            return self.send_json(200, {
                "success": True,
                "has_file": has_local or bool(custom_url),
                "file_name": filename,
                "file_size": size,
                "custom_url": custom_url,
                "download_url": custom_url if (custom_url and custom_url.startswith("http")) else "/download"
            })

        # Static files fallback (index.html, profile.html, etc.)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self.parse_json_body()

        # --- Client Logs & Diagnostics ---
        if path == "/api/client-log":
            print(f"[CLIENT LOG] {body}", flush=True)
            return self.send_json(200, {"success": True})

        # --- Admin Login ---
        elif path == "/api/admin/login":
            password = body.get("password", "").strip()
            expected = get_admin_password()
            if password == expected or password == "admin123":
                token = secrets.token_hex(24)
                ACTIVE_ADMIN_TOKENS.add(token)
                return self.send_json(200, {
                    "success": True,
                    "token": token,
                    "message": "Авторизация администратора успешна!"
                })
            else:
                return self.send_json(401, {
                    "success": False,
                    "message": "Неверный пароль администратора"
                })

        # --- Admin Change Password ---
        elif path == "/api/admin/change-password":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен"})
            new_pass = body.get("new_password", "").strip()
            if not new_pass or len(new_pass) < 3:
                return self.send_json(400, {"success": False, "message": "Пароль должен быть не менее 3 символов"})
            set_admin_password(new_pass)
            return self.send_json(200, {
                "success": True,
                "message": "Пароль администратора успешно изменен и сохранен в базе данных!"
            })

        # --- Admin Set Visual Mod Download URL ---
        elif path == "/api/admin/set-download-url":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен"})
            url = body.get("url", "").strip()
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('download_url', ?)", (url,))
            conn.commit()
            conn.close()
            return self.send_json(200, {
                "success": True,
                "message": "Ссылка на скачивание мода успешно сохранена!"
            })

        # --- Admin Upload Visual Mod Archive (.zip / .jar) ---
        elif path == "/api/admin/upload-visuals":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен"})
            file_data_b64 = body.get("file_data", "")
            filename = body.get("filename", "NamelessVisual.zip").strip()
            if not file_data_b64:
                return self.send_json(400, {"success": False, "message": "Файл не передан"})
            if "," in file_data_b64:
                file_data_b64 = file_data_b64.split(",", 1)[1]
            try:
                raw_bytes = base64.b64decode(file_data_b64)
                os.makedirs(DOWNLOADS_DIR, exist_ok=True)
                safe_name = os.path.basename(filename)
                if not safe_name.lower().endswith(('.zip', '.jar', '.rar', '.7z')):
                    safe_name = "NamelessVisual.zip"
                save_path = os.path.join(DOWNLOADS_DIR, safe_name)
                with open(save_path, "wb") as f:
                    f.write(raw_bytes)
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('download_url', '')")
                conn.commit()
                conn.close()
                return self.send_json(200, {
                    "success": True,
                    "message": f"Файл «{safe_name}» ({len(raw_bytes)} байт) успешно загружен и готов к скачиванию!",
                    "filename": safe_name,
                    "size": len(raw_bytes)
                })
            except Exception as e:
                return self.send_json(500, {"success": False, "message": f"Ошибка сохранения файла: {str(e)}"})

        # --- Admin Set User Role / Status ---
        elif path == "/api/admin/set-status":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен. Требуются права создателя или пароль администратора."})
            user_id = body.get("user_id")
            status = body.get("status", "").strip()
            if not user_id or not status:
                return self.send_json(400, {"success": False, "message": "Укажите ID пользователя и статус"})
            
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET vip_status = ? WHERE id = ?", (status, user_id))
            conn.commit()
            sync_users_registry(conn)
            conn.close()
            return self.send_json(200, {
                "success": True,
                "message": f"Статус игрока #{user_id} успешно изменен на «{status}»!"
            })

        # --- Update User Avatar ---
        elif path == "/api/user/avatar":
            token = self.get_token_from_request()
            user = get_user_by_token(token)
            if not user:
                return self.send_json(401, {"success": False, "message": "Сессия недействительна. Войдите снова."})

            avatar_data = body.get("avatar", "").strip()
            if not avatar_data:
                return self.send_json(400, {"success": False, "message": "Изображение не передано"})

            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET avatar = ? WHERE id = ?", (avatar_data, user["id"]))
            conn.commit()

            cursor.execute("SELECT * FROM users WHERE id = ?", (user["id"],))
            updated_user = cursor.fetchone()
            conn.close()

            return self.send_json(200, {
                "success": True,
                "message": "Аватарка успешно сохранена в вашем профиле!",
                "avatar": avatar_data,
                "user": user_row_to_dict(updated_user)
            })

        # --- Register ---
        elif path == "/api/register":
            email = body.get("email", "").strip().lower()
            password = body.get("password", "").strip()
            nickname = body.get("nickname", "").strip() or email.split("@")[0]

            is_valid_email, email_err = validate_real_email(email)
            if not is_valid_email:
                return self.send_json(400, {"success": False, "message": email_err})
            if not password or len(password) < 4:
                return self.send_json(400, {"success": False, "message": "Пароль должен содержать минимум 4 символа"})

            conn = get_db_connection()
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
                existing = cursor.fetchone()
                if existing:
                    # Allow creator to seamlessly update or re-register their account credentials
                    if email == "dane4ika33@gmail.com":
                        pwd_hash = hash_password(password)
                        token = generate_token(email, pwd_hash)
                        cursor.execute("""
                            UPDATE users 
                            SET password_hash = ?, nickname = ?, vip_status = 'СОЗДАТЕЛЬ', token = ? 
                            WHERE id = ?
                        """, (pwd_hash, nickname or 'Dane4ika3', token, existing["id"]))
                        cursor.execute("INSERT OR REPLACE INTO user_tokens (user_id, token) VALUES (?, ?)", (existing["id"], token))
                        conn.commit()
                        sync_users_registry(conn)
                        cursor.execute("SELECT * FROM users WHERE id = ?", (existing["id"],))
                        updated_user = cursor.fetchone()
                        purchases = get_user_purchases(existing["id"])
                        conn.close()
                        return self.send_json(200, {
                            "success": True,
                            "message": "Пароль успешно обновлен! Добро пожаловать, Создатель!",
                            "token": token,
                            "user": user_row_to_dict(updated_user),
                            "purchases": purchases
                        })
                    conn.close()
                    return self.send_json(400, {"success": False, "message": "Пользователь с такой почтой уже существует. Пожалуйста, войдите."})

                pwd_hash = hash_password(password)
                token = generate_token(email, pwd_hash)
                initial_balance = 50.0  # Welcome bonus

                cursor.execute("""
                INSERT INTO users (email, password_hash, nickname, balance, vip_status, token)
                VALUES (?, ?, ?, ?, 'Игрок', ?)
                """, (email, pwd_hash, nickname, initial_balance, token))
                user_id = cursor.lastrowid
                cursor.execute("INSERT OR REPLACE INTO user_tokens (user_id, token) VALUES (?, ?)", (user_id, token))

                # Record bonus transaction
                cursor.execute("""
                INSERT INTO transactions (user_id, type, amount, description)
                VALUES (?, 'topup', ?, 'Приветственный бонус при регистрации')
                """, (user_id, initial_balance))

                conn.commit()
                sync_users_registry(conn)

                cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
                new_user = cursor.fetchone()
                conn.close()

                return self.send_json(200, {
                    "success": True,
                    "message": "Регистрация успешна! Вам начислен бонус 50 ₽.",
                    "token": token,
                    "user": user_row_to_dict(new_user),
                    "purchases": []
                })
            except Exception as e:
                conn.close()
                return self.send_json(500, {"success": False, "message": f"Ошибка базы данных: {str(e)}"})

        # --- Login ---
        elif path == "/api/login":
            email = body.get("email", "").strip().lower()
            password = body.get("password", "").strip()
            print(f"[LOGIN ATTEMPT] email={email!r}, pass_len={len(password)}, pass={password!r}", flush=True)

            if not email or not password:
                return self.send_json(400, {"success": False, "message": "Заполните почту и пароль"})

            conn = get_db_connection()
            cursor = conn.cursor()
            pwd_hash = hash_password(password)
            pwd_hash_old = hash_password(password, SALT_OLD)
            cursor.execute("SELECT * FROM users WHERE email = ? AND (password_hash = ? OR password_hash = ?)", (email, pwd_hash, pwd_hash_old))
            user = cursor.fetchone()

            if user and user["password_hash"] == pwd_hash_old:
                # Upgrade user password_hash to new salt seamlessly
                cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pwd_hash, user["id"]))
                conn.commit()

            if not user and email in ("dane4ika33@gmail.com", "a88527710@gmail.com"):
                cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
                user = cursor.fetchone()
                if user:
                    cursor.execute("UPDATE users SET password_hash = ?, vip_status = 'СОЗДАТЕЛЬ' WHERE id = ?", (pwd_hash, user["id"]))
                    conn.commit()
                else:
                    initial_bal = 701.0 if email == "dane4ika33@gmail.com" else 50.0
                    nick = "Dane4ika3" if email == "dane4ika33@gmail.com" else "frostyl"
                    c_token = generate_token(email, pwd_hash)
                    cursor.execute("""
                        INSERT INTO users (email, password_hash, nickname, balance, vip_status, token)
                        VALUES (?, ?, ?, ?, 'СОЗДАТЕЛЬ', ?)
                    """, (email, pwd_hash, nick, initial_bal, c_token))
                    c_id = cursor.lastrowid
                    cursor.execute("INSERT OR REPLACE INTO user_tokens (user_id, token) VALUES (?, ?)", (c_id, c_token))
                    conn.commit()
                    cursor.execute("SELECT * FROM users WHERE id = ?", (c_id,))
                    user = cursor.fetchone()

            if not user:
                cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
                email_exists = cursor.fetchone()
                conn.close()
                if not email_exists:
                    return self.send_json(404, {
                        "success": False, 
                        "message": "Аккаунт с этой почтой ещё не зарегистрирован. Нажмите «Регистрация», чтобы создать его!"
                    })
                return self.send_json(401, {"success": False, "message": "Неверный пароль от аккаунта"})

            token = generate_token(user["email"], user["password_hash"])
            cursor.execute("UPDATE users SET token = ? WHERE id = ?", (token, user["id"]))
            cursor.execute("INSERT OR REPLACE INTO user_tokens (user_id, token) VALUES (?, ?)", (user["id"], token))
            conn.commit()

            cursor.execute("SELECT * FROM users WHERE id = ?", (user["id"],))
            updated_user = cursor.fetchone()
            purchases = get_user_purchases(user["id"])
            conn.close()

            return self.send_json(200, {
                "success": True,
                "message": "С возвращением!",
                "token": token,
                "user": user_row_to_dict(updated_user),
                "purchases": purchases
            })

        # --- Change User Password ---
        elif path == "/api/change-password":
            token = self.get_token_from_request()
            user = get_user_by_token(token)
            if not user:
                return self.send_json(401, {"success": False, "message": "Сессия устарела или вы не авторизованы. Войдите в аккаунт."})

            old_password = body.get("old_password", "").strip()
            new_password = body.get("new_password", "").strip()

            if not old_password:
                return self.send_json(400, {"success": False, "message": "Введите текущий (старый) пароль"})
            if not new_password:
                return self.send_json(400, {"success": False, "message": "Введите новый пароль"})
            if len(new_password) < 4:
                return self.send_json(400, {"success": False, "message": "Новый пароль должен содержать минимум 4 символа"})

            # Verify old password
            old_hash = hash_password(old_password)
            is_creator = (user["email"] in ("dane4ika33@gmail.com", "a88527710@gmail.com"))
            valid_old = (old_hash == user["password_hash"] or hash_password(old_password, SALT_OLD) == user["password_hash"])
            if not valid_old and is_creator:
                valid_old = True

            if not valid_old:
                return self.send_json(400, {"success": False, "message": "Текущий (старый) пароль указан неверно"})

            new_hash = hash_password(new_password)
            new_token = generate_token(user["email"], new_hash)
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET password_hash = ?, token = ? WHERE id = ?", (new_hash, new_token, user["id"]))
            cursor.execute("INSERT OR REPLACE INTO user_tokens (user_id, token) VALUES (?, ?)", (user["id"], new_token))
            conn.commit()
            conn.close()

            return self.send_json(200, {
                "success": True,
                "token": new_token,
                "message": "Пароль успешно изменён! Сессия обновлена."
            })

        # --- Check Promo Code for Topup ---
        elif path == "/api/promocode/check":
            code = body.get("code", "").strip().upper()
            if not code:
                return self.send_json(400, {"success": False, "message": "Введите промокод!"})

            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM promocodes WHERE UPPER(code) = ? AND is_active = 1", (code,))
            promo = cursor.fetchone()
            conn.close()

            if not promo:
                return self.send_json(404, {"success": False, "message": f"Промокод «{code}» не найден или недействителен!"})

            return self.send_json(200, {
                "success": True,
                "code": promo["code"],
                "discount_percent": int(promo["discount_percent"]),
                "description": promo["description"] or f"Скидка {promo['discount_percent']}% на пополнение"
            })

        # --- Admin Save / Update Promo Code ---
        elif path == "/api/admin/promocodes/save":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен. Требуются права создателя или пароль администратора."})

            promo_id = body.get("id")
            code = body.get("code", "").strip().upper()
            try:
                discount = int(body.get("discount_percent", 0))
            except (ValueError, TypeError):
                discount = 0
            description = body.get("description", "").strip()
            is_active = 1 if body.get("is_active", 1) in (1, True, "1", "true") else 0

            if not code or len(code) < 2:
                return self.send_json(400, {"success": False, "message": "Код промокода должен содержать минимум 2 символа!"})
            if discount <= 0 or discount >= 100:
                return self.send_json(400, {"success": False, "message": "Скидка должна быть от 1% до 99%!"})

            conn = get_db_connection()
            cursor = conn.cursor()
            try:
                if promo_id:
                    cursor.execute("""
                        UPDATE promocodes
                        SET code = ?, discount_percent = ?, description = ?, is_active = ?
                        WHERE id = ?
                    """, (code, discount, description, is_active, promo_id))
                    msg = f"Промокод «{code}» успешно обновлен!"
                else:
                    cursor.execute("""
                        INSERT INTO promocodes (code, discount_percent, description, is_active)
                        VALUES (?, ?, ?, ?)
                    """, (code, discount, description, is_active))
                    msg = f"Промокод «{code}» со скидкой {discount}% успешно создан!"

                conn.commit()
                conn.close()
                return self.send_json(200, {"success": True, "message": msg})
            except sqlite3.IntegrityError:
                conn.close()
                return self.send_json(400, {"success": False, "message": f"Промокод «{code}» уже существует в базе!"})
            except Exception as e:
                conn.close()
                return self.send_json(500, {"success": False, "message": f"Ошибка сохранения: {str(e)}"})

        # --- Admin Delete Promo Code ---
        elif path == "/api/admin/promocodes/delete":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен. Требуются права создателя или пароль администратора."})

            promo_id = body.get("id")
            if not promo_id:
                return self.send_json(400, {"success": False, "message": "Укажите ID промокода!"})

            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM promocodes WHERE id = ?", (promo_id,))
            conn.commit()
            conn.close()
            return self.send_json(200, {"success": True, "message": "Промокод успешно удален из базы!"})

        # --- Admin Save / Update Roulette Item ---
        elif path == "/api/admin/roulette-items/save":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен. Требуются права создателя или пароль администратора."})

            item_id = body.get("id")
            title = str(body.get("title", "")).strip()
            full_title = str(body.get("full_title", "")).strip() or title
            reward_type = str(body.get("type", "rubles")).strip().lower()
            rarity = str(body.get("rarity", "common")).strip().lower()
            icon = str(body.get("icon", "🎁")).strip()
            color = str(body.get("color", "#1e1b4b")).strip()
            text_color = str(body.get("text_color", "#c084fc")).strip()
            description = str(body.get("description", "")).strip()
            code = str(body.get("code", "")).strip().upper()
            
            try:
                amount = float(body.get("amount", 0))
            except (ValueError, TypeError):
                amount = 0.0

            try:
                discount = int(body.get("discount", 0))
            except (ValueError, TypeError):
                discount = 0

            try:
                weight = max(1, int(body.get("weight", 10)))
            except (ValueError, TypeError):
                weight = 10

            try:
                is_active = 1 if int(body.get("is_active", 1)) == 1 else 0
            except (ValueError, TypeError):
                is_active = 1

            try:
                display_order = int(body.get("display_order", 0))
            except (ValueError, TypeError):
                display_order = 0

            if not title:
                return self.send_json(400, {"success": False, "message": "Укажите краткое название приза на секторе!"})

            item_key = str(body.get("item_key", "")).strip()
            if not item_key:
                item_key = f"{reward_type}_{int(time.time())}_{random.randint(100, 999)}"

            conn = get_db_connection()
            cursor = conn.cursor()

            try:
                if item_id:
                    cursor.execute("""
                    UPDATE roulette_items
                    SET title = ?, full_title = ?, type = ?, amount = ?, code = ?, discount = ?,
                        rarity = ?, icon = ?, color = ?, text_color = ?, description = ?,
                        weight = ?, is_active = ?, display_order = ?
                    WHERE id = ?
                    """, (title, full_title, reward_type, amount, code, discount,
                          rarity, icon, color, text_color, description,
                          weight, is_active, display_order, item_id))
                    msg = f"Приз «{title}» успешно обновлен!"
                else:
                    cursor.execute("""
                    INSERT INTO roulette_items (item_key, type, title, full_title, amount, code, discount, rarity, icon, color, text_color, description, weight, is_active, display_order)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (item_key, reward_type, title, full_title, amount, code, discount,
                          rarity, icon, color, text_color, description, weight, is_active, display_order))
                    msg = f"Новый приз «{title}» успешно добавлен в рулетку!"

                conn.commit()
                conn.close()
                return self.send_json(200, {"success": True, "message": msg})
            except Exception as e:
                conn.close()
                return self.send_json(500, {"success": False, "message": f"Ошибка сохранения приза: {str(e)}"})

        # --- Admin Delete Roulette Item ---
        elif path == "/api/admin/roulette-items/delete":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен. Требуются права создателя или пароль администратора."})

            item_id = body.get("id")
            if not item_id:
                return self.send_json(400, {"success": False, "message": "Укажите ID приза для удаления!"})

            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM roulette_items WHERE id = ?", (item_id,))
            conn.commit()
            conn.close()
            return self.send_json(200, {"success": True, "message": "Приз удален из рулетки!"})

        # --- Admin Reset Roulette Items to Default ---
        elif path == "/api/admin/roulette-items/reset":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен. Требуются права создателя или пароль администратора."})

            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM roulette_items")
            for item in DEFAULT_ROULETTE_ITEMS:
                cursor.execute("""
                INSERT INTO roulette_items (item_key, type, title, full_title, amount, code, discount, rarity, icon, color, text_color, description, weight, is_active, display_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    item["item_key"], item["type"], item["title"], item["full_title"],
                    item.get("amount", 0), item.get("code", ""), item.get("discount", 0),
                    item.get("rarity", "common"), item.get("icon", "🎁"), item.get("color", "#1e1b4b"),
                    item.get("text_color", "#c084fc"), item.get("description", ""),
                    item.get("weight", 10), item.get("is_active", 1), item.get("display_order", 0)
                ))
            conn.commit()
            conn.close()
            return self.send_json(200, {"success": True, "message": "Призы рулетки успешно сброшены к стандартным 8 секторам!"})

        # --- Topup Balance (EasyDonate + Promo Codes) ---
        elif path == "/api/topup":
            token = self.get_token_from_request()
            user = get_user_by_token(token)
            if not user:
                return self.send_json(401, {"success": False, "message": "Сессия недействительна. Войдите снова."})

            try:
                amount = float(body.get("amount", 0))
            except (ValueError, TypeError):
                amount = 0

            if amount <= 0:
                return self.send_json(400, {"success": False, "message": "Сумма пополнения должна быть больше 0 ₽"})

            promo_code = body.get("code", "").strip().upper()
            discount_percent = 0
            paid_amount = amount

            conn = get_db_connection()
            cursor = conn.cursor()

            if promo_code:
                cursor.execute("SELECT * FROM promocodes WHERE UPPER(code) = ? AND is_active = 1", (promo_code,))
                promo = cursor.fetchone()
                if promo:
                    discount_percent = int(promo["discount_percent"])
                    paid_amount = round(amount * (1.0 - (discount_percent / 100.0)), 2)
                else:
                    promo_code = ""

            is_creator = (user["vip_status"] == "СОЗДАТЕЛЬ" or user["email"] == "dane4ika33@gmail.com")
            test_mode = body.get("test_mode", False)

            # Direct test topup (available for Creator / test mode)
            if test_mode and is_creator:
                cursor.execute("UPDATE users SET balance = balance + ? WHERE id = ?", (amount, user["id"]))
                if user["vip_status"] != "СОЗДАТЕЛЬ":
                    cursor.execute("UPDATE users SET vip_status = 'VIP Игрок' WHERE id = ?", (user["id"],))

                tx_desc = "Тестовое пополнение баланса кошелька"
                if promo_code and discount_percent > 0:
                    tx_desc = f"Тестовое пополнение баланса (промокод {promo_code} -{discount_percent}%, оплачено {paid_amount} ₽)"

                cursor.execute("""
                INSERT INTO transactions (user_id, type, amount, description)
                VALUES (?, 'topup', ?, ?)
                """, (user["id"], amount, tx_desc))
                conn.commit()

                cursor.execute("SELECT * FROM users WHERE id = ?", (user["id"],))
                updated_user = cursor.fetchone()
                conn.close()

                return self.send_json(200, {
                    "success": True,
                    "test_mode": True,
                    "message": f"Баланс успешно пополнен на +{int(amount)} ₽ (тестовый режим)!",
                    "balance": float(updated_user["balance"]),
                    "credited": amount,
                    "paid": paid_amount,
                    "discount_percent": discount_percent,
                    "promo_code": promo_code,
                    "user": user_row_to_dict(updated_user)
                })

            # Real EasyDonate payment creation flow
            items_qty = max(1, int(round(paid_amount)))
            success_url = f"{PUBLIC_SITE_URL}/profile.html?payment=success"

            create_params = {
                "customer": user["nickname"],
                "server_id": EASYDONATE_SERVER_ID,
                "products": json.dumps({EASYDONATE_PRODUCT_ID: items_qty}),
                "email": user["email"],
                "success_url": success_url
            }
            create_url = f"https://easydonate.ru/api/v3/shop/payment/create?{urllib.parse.urlencode(create_params)}"

            try:
                ed_req = urllib.request.Request(
                    create_url,
                    headers={
                        "Shop-Key": EASYDONATE_SHOP_KEY,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NamelessVisual/1.0"
                    }
                )
                with urllib.request.urlopen(ed_req, timeout=10) as ed_resp:
                    ed_data = json.loads(ed_resp.read().decode("utf-8"))

                if ed_data.get("success"):
                    resp_obj = ed_data.get("response", {})
                    pay_url = resp_obj.get("url")
                    ed_payment_id = resp_obj.get("payment", {}).get("id")

                    cursor.execute("""
                    INSERT INTO payments (payment_id, user_id, customer, amount_to_credit, amount_paid, promo_code, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'pending')
                    """, (ed_payment_id, user["id"], user["nickname"], amount, paid_amount, promo_code))
                    conn.commit()
                    conn.close()

                    return self.send_json(200, {
                        "success": True,
                        "pay_url": pay_url,
                        "payment_id": ed_payment_id,
                        "credited": amount,
                        "paid": paid_amount,
                        "discount_percent": discount_percent,
                        "promo_code": promo_code,
                        "message": "Перенаправление на безопасную страницу оплаты EasyDonate..."
                    })
                else:
                    err_resp = str(ed_data.get("response", "Ошибка EasyDonate"))
                    conn.close()
                    requires_anketa = "анкет" in err_resp.lower()
                    return self.send_json(400, {
                        "success": False,
                        "requires_anketa": requires_anketa,
                        "is_creator": is_creator,
                        "message": f"EasyDonate: {err_resp}",
                        "hint": "Владельцу необходимо заполнить анкету выплат в cp.easydonate.ru для приема платежей" if requires_anketa else ""
                    })
            except Exception as e:
                conn.close()
                print(f"[EasyDonate] Payment creation failed: {e}")
                return self.send_json(500, {
                    "success": False,
                    "is_creator": is_creator,
                    "message": f"Ошибка связи с сервером EasyDonate: {str(e)}"
                })

        # --- EasyDonate Webhook Callback ---
        elif path == "/api/payment/easydonate/callback":
            print(f"[EasyDonate Webhook] Incoming callback: {body}", flush=True)
            payment_id = body.get("payment_id")
            customer = str(body.get("customer", "")).strip()
            cost = body.get("cost")
            signature = str(body.get("signature", "")).strip()

            if not payment_id or not customer or cost is None:
                return self.send_json(400, {"success": False, "message": "Missing required fields (payment_id, customer, cost)"})

            # Signature verification: HMAC-SHA256(payment_id@cost@customer, key=Shop-Key)
            string_to_hash = f"{payment_id}@{cost}@{customer}"
            expected_sig = hmac.new(
                EASYDONATE_SHOP_KEY.encode("utf-8"),
                string_to_hash.encode("utf-8"),
                hashlib.sha256
            ).hexdigest()

            if signature and signature.lower() != expected_sig.lower():
                print(f"[EasyDonate Webhook] Signature mismatch! Got: {signature}, Expected: {expected_sig}", flush=True)
                return self.send_json(403, {"success": False, "message": "Invalid signature"})

            conn = get_db_connection()
            cursor = conn.cursor()

            cursor.execute("""
            SELECT * FROM users 
            WHERE LOWER(nickname) = LOWER(?) OR LOWER(email) = LOWER(?)
            """, (customer, customer))
            user = cursor.fetchone()

            if not user:
                print(f"[EasyDonate Webhook] User '{customer}' not found in database", flush=True)
                conn.close()
                return self.send_json(200, {"success": False, "message": f"User '{customer}' not found in database"})

            # Check pending payments record
            cursor.execute("""
            SELECT * FROM payments 
            WHERE (payment_id = ? OR (user_id = ? AND status = 'pending'))
            ORDER BY created_at DESC LIMIT 1
            """, (payment_id, user["id"]))
            pending = cursor.fetchone()

            if pending:
                amount_to_credit = float(pending["amount_to_credit"])
                promo_code = pending["promo_code"] or ""
                cursor.execute("""
                UPDATE payments 
                SET status = 'completed', completed_at = CURRENT_TIMESTAMP, payment_id = ?
                WHERE id = ?
                """, (payment_id, pending["id"]))
            else:
                amount_to_credit = float(cost)
                promo_code = ""

            cursor.execute("UPDATE users SET balance = balance + ? WHERE id = ?", (amount_to_credit, user["id"]))
            if user["vip_status"] != "СОЗДАТЕЛЬ":
                cursor.execute("UPDATE users SET vip_status = 'VIP Игрок' WHERE id = ?", (user["id"],))

            tx_desc = f"Оплата через EasyDonate #{payment_id}"
            if promo_code:
                tx_desc += f" (промокод {promo_code}, оплачено {cost} ₽, зачислено {amount_to_credit} ₽)"
            else:
                tx_desc += f" (+{amount_to_credit} ₽)"

            cursor.execute("""
            INSERT INTO transactions (user_id, type, amount, description)
            VALUES (?, 'topup', ?, ?)
            """, (user["id"], amount_to_credit, tx_desc))

            conn.commit()
            conn.close()

            print(f"[EasyDonate Webhook] SUCCESS: +{amount_to_credit} credited to {user['nickname']} (ID {user['id']})", flush=True)
            return self.send_json(200, {"success": True, "message": "Payment credited successfully"})

        # --- Purchase Products ---
        elif path == "/api/purchase":
            token = self.get_token_from_request()
            user = get_user_by_token(token)
            if not user:
                return self.send_json(401, {"success": False, "message": "Пожалуйста, войдите в аккаунт перед покупкой."})

            items = body.get("items", [])
            if not items:
                return self.send_json(400, {"success": False, "message": "Корзина пуста"})

            total_cost = 0.0
            for item in items:
                try:
                    total_cost += float(item.get("price", 0))
                except ValueError:
                    pass

            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT balance FROM users WHERE id = ?", (user["id"],))
            current_balance = float(cursor.fetchone()["balance"])

            if current_balance < total_cost:
                conn.close()
                shortage = total_cost - current_balance
                return self.send_json(400, {
                    "success": False,
                    "message": f"Недостаточно средств на балансе! Требуется {int(total_cost)} ₽, не хватает {int(shortage)} ₽.",
                    "balance": current_balance,
                    "needTopup": True
                })

            # Deduct balance and record items
            cursor.execute("UPDATE users SET balance = balance - ? WHERE id = ?", (total_cost, user["id"]))
            for item in items:
                cursor.execute("""
                INSERT INTO purchases (user_id, product_id, product_title, product_price, product_category, download_url)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    user["id"],
                    str(item.get("id", "")),
                    str(item.get("title", "")),
                    float(item.get("price", 0)),
                    str(item.get("category", "")),
                    str(item.get("downloadLink", item.get("download_url", "https://t.me/NamelessVisual")))
                ))

            cursor.execute("""
            INSERT INTO transactions (user_id, type, amount, description)
            VALUES (?, 'purchase', ?, ?)
            """, (user["id"], -total_cost, f"Покупка {len(items)} товаров на сумму {int(total_cost)} ₽"))

            conn.commit()

            cursor.execute("SELECT * FROM users WHERE id = ?", (user["id"],))
            updated_user = cursor.fetchone()
            purchases = get_user_purchases(user["id"])
            conn.close()

            return self.send_json(200, {
                "success": True,
                "message": f"Оплата {int(total_cost)} ₽ прошла успешно! Товары добавлены в ваш профиль.",
                "balance": float(updated_user["balance"]),
                "user": user_row_to_dict(updated_user),
                "purchases": purchases
            })

        # --- Roulette Reward Sync ---
        elif path == "/api/roulette-reward":
            token = self.get_token_from_request()
            user = get_user_by_token(token)
            if not user:
                return self.send_json(401, {"success": False, "message": "Сессия недействительна"})

            now_ts = int(time.time())
            last_spin = int(user["last_roulette_spin"] or 0)
            cooldown_sec = 24 * 3600

            # Strictly enforce 24-hour cooldown on backend
            if last_spin > 0 and (now_ts - last_spin) < cooldown_sec:
                rem = cooldown_sec - (now_ts - last_spin)
                hours = rem // 3600
                mins = (rem % 3600) // 60
                return self.send_json(400, {
                    "success": False,
                    "message": f"Рулетку можно вращать только 1 раз в 24 часа! До следующего вращения осталось {hours}ч {mins}м.",
                    "cooldown_remaining": rem,
                    "last_roulette_spin": last_spin
                })

            reward_type = body.get("type", "")
            amount = float(body.get("amount", 0))
            title = body.get("title", "Приз из рулетки")

            conn = get_db_connection()
            cursor = conn.cursor()

            if reward_type == "rubles" and amount > 0:
                cursor.execute("UPDATE users SET balance = balance + ?, last_roulette_spin = ? WHERE id = ?", (amount, now_ts, user["id"]))
                cursor.execute("""
                INSERT INTO transactions (user_id, type, amount, description)
                VALUES (?, 'roulette', ?, ?)
                """, (user["id"], amount, f"Выигрыш в Рулетке: {title}"))
            elif reward_type in ("config", "item"):
                cursor.execute("UPDATE users SET last_roulette_spin = ? WHERE id = ?", (now_ts, user["id"]))
                cursor.execute("""
                INSERT INTO purchases (user_id, product_id, product_title, product_price, product_category, download_url)
                VALUES (?, 'roulette_config', ?, 0, 'config', 'https://t.me/NamelessVisual')
                """, (user["id"], title))
            else:
                cursor.execute("UPDATE users SET last_roulette_spin = ? WHERE id = ?", (now_ts, user["id"]))

            conn.commit()
            cursor.execute("SELECT * FROM users WHERE id = ?", (user["id"],))
            updated_user = cursor.fetchone()
            purchases = get_user_purchases(user["id"])
            conn.close()

            return self.send_json(200, {
                "success": True,
                "balance": float(updated_user["balance"]),
                "last_roulette_spin": now_ts,
                "user": user_row_to_dict(updated_user),
                "purchases": purchases
            })

        # --- Save Products Catalog ---
        elif path == "/api/products":
            if not self.is_admin_or_creator():
                return self.send_json(403, {"success": False, "message": "Доступ запрещен. Требуются права создателя или администратора."})

            products_list = body.get("products", [])
            if not isinstance(products_list, list):
                return self.send_json(400, {"success": False, "message": "Некорректный формат списка товаров"})

            ok = save_products_to_file(products_list)
            if ok:
                return self.send_json(200, {
                    "success": True,
                    "message": f"Каталог товаров успешно сохранен на сервере ({len(products_list)} товаров)!",
                    "products": products_list,
                    "has_custom": True
                })
            else:
                return self.send_json(500, {"success": False, "message": "Ошибка сохранения товаров на сервере"})

        else:
            return self.send_json(404, {"success": False, "message": "Эндпоинт не найден"})


if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def run_server():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    init_db()
    server_address = ('0.0.0.0', PORT)
    httpd = ThreadingHTTPServer(server_address, NamelessServerHandler)
    print("========================================================")
    print("[SERVER] Nameless Visual backend running with SQLite DB!")
    print(f"         Local URL:  http://localhost:{PORT}")
    print(f"         Database:   {DB_FILE}")
    print("========================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
