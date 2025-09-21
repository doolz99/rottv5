from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import os
from fastapi.middleware.cors import CORSMiddleware
import uuid
import asyncio
from collections import deque
from typing import Dict, Set, Optional, List, Tuple
import time

# ================= TAG CANVAS (Collaborative per-tag boards) =================
# In-memory ephemeral structures; cleared on process restart.
# Each tag has: strokes (list limited), texts (dict), participants (set of user ids), last_updated timestamp.
MAX_STROKES_PER_TAG = 400
MAX_TEXTS_PER_TAG = 80
TAG_CANVAS_IDLE_SECONDS = 60 * 30  # 30 minutes idle eviction

class TagCanvas:
    __slots__ = ("strokes", "texts", "participants", "last_updated")
    def __init__(self):
        self.strokes: List[Dict] = []  # {id, color, w, points:[{x,y,t}]}
        self.texts: Dict[str, Dict] = {}  # id -> {id,x,y,content,color}
        self.participants: Set[str] = set()
        self.last_updated: float = time.time()

tag_canvases: Dict[str, TagCanvas] = {}

def get_tag_canvas(tag: str) -> TagCanvas:
    c = tag_canvases.get(tag)
    if not c:
        c = TagCanvas()
        tag_canvases[tag] = c
    return c

def prune_tag_canvas_if_idle(tag: str):
    c = tag_canvases.get(tag)
    if not c:
        return
    if not c.participants and (time.time() - c.last_updated) > TAG_CANVAS_IDLE_SECONDS:
        tag_canvases.pop(tag, None)

async def broadcast_tag_canvas(tag: str, payload: Dict):
    c = tag_canvases.get(tag)
    if not c:
        return
    stale_users = []
    for uid in list(c.participants):
        ws = user_ws.get(uid)
        if not ws:
            stale_users.append(uid)
            continue
        try:
            await ws.send_json(payload)
        except Exception:
            stale_users.append(uid)
    for su in stale_users:
        c.participants.discard(su)
    prune_tag_canvas_if_idle(tag)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data structures
waiting_random: deque[str] = deque()
waiting_tagged: List[Tuple[str, Set[str]]] = []  # (user_id, tags)
active_chats: Dict[str, Dict] = {}
user_ws: Dict[str, WebSocket] = {}
user_mode: Dict[str, str] = {}  # 'random' or 'tags'
user_tags: Dict[str, Set[str]] = {}
user_chat: Dict[str, Optional[str]] = {}

def current_tag_counts() -> Dict[str, int]:
    counts: Dict[str,int] = {}
    for uid, mode in user_mode.items():
        if mode == 'tags':
            for t in user_tags.get(uid, set()):
                counts[t] = counts.get(t,0)+1
    return counts

async def broadcast_tag_counts():
    counts = current_tag_counts()
    if not user_ws:
        return
    payload = {"type":"tag_counts","counts":counts}
    # Best-effort broadcast
    for ws in list(user_ws.values()):
        try:
            await ws.send_json(payload)
        except Exception:
            pass

async def broadcast_population():
    # Total connected websocket users
    total = len(user_ws)
    if not user_ws:
        return
    payload = {"type":"population", "count": total}
    for ws in list(user_ws.values()):
        try:
            await ws.send_json(payload)
        except Exception:
            pass

PAIR_LOCK = asyncio.Lock()

# Typing throttle server side (optional) - we forward everything but can choose to limit if needed.

async def pair_user(user_id: str):
    mode = user_mode.get(user_id)
    if mode == 'random':
        # Try match another random waiting user
        while waiting_random:
            other_id = waiting_random.popleft()
            if other_id == user_id:
                continue
            if user_chat.get(other_id):
                continue
            return await establish_chat(user_id, other_id, matched_tags=set())
        # If no match, enqueue
        waiting_random.append(user_id)
    elif mode == 'tags':
        my_tags = user_tags.get(user_id, set())
        # linear scan for intersection
        for idx, (other_id, tags) in enumerate(waiting_tagged):
            if other_id == user_id:
                continue
            if user_chat.get(other_id):
                continue
            intersection = my_tags & tags
            if intersection:
                # remove other from waiting list
                waiting_tagged.pop(idx)
                return await establish_chat(user_id, other_id, matched_tags=intersection)
        # If not found, add self
        waiting_tagged.append((user_id, my_tags))

async def establish_chat(a: str, b: str, matched_tags: Set[str]):
    """Attempt to create a chat between a & b.
    If sending the paired event fails for either side, roll back and requeue the other user.
    """
    chat_id = str(uuid.uuid4())
    active_chats[chat_id] = {"a": a, "b": b, "tags": matched_tags}
    user_chat[a] = chat_id
    user_chat[b] = chat_id
    ws_a = user_ws.get(a)
    ws_b = user_ws.get(b)
    payload = {"type": "paired", "chatId": chat_id, "matchedTags": sorted(list(matched_tags))}
    send_errors = []
    for uid, ws in ((a, ws_a), (b, ws_b)):
        if not ws:
            send_errors.append(uid)
            continue
        try:
            await ws.send_json(payload)
        except Exception:
            send_errors.append(uid)
    if send_errors:
        # Rollback: tear down chat and requeue survivors still connected
        active_chats.pop(chat_id, None)
        for uid in (a, b):
            if user_chat.get(uid) == chat_id:
                user_chat[uid] = None
        # Requeue the user whose send succeeded (the other may have disconnected)
        for uid in (a, b):
            if uid not in send_errors and user_ws.get(uid):
                # Requeue according to their mode
                mode = user_mode.get(uid)
                if mode == 'random':
                    waiting_random.append(uid)
                elif mode == 'tags':
                    waiting_tagged.append((uid, user_tags.get(uid, set())))
        return

async def leave_queue(user_id: str):
    # Remove from random queue
    try:
        waiting_random.remove(user_id)
    except ValueError:
        pass
    # Remove from tagged queue
    for idx, (uid, _tags) in enumerate(list(waiting_tagged)):
        if uid == user_id:
            waiting_tagged.pop(idx)
            break

async def disconnect_user(user_id: str, notify_partner: bool = True):
    # Remove from queues
    await leave_queue(user_id)
    # Remove from tag canvas participants
    for tag, canvas in list(tag_canvases.items()):
        if user_id in canvas.participants:
            canvas.participants.discard(user_id)
            canvas.last_updated = time.time()
            # Fire-and-forget participant update
            try:
                await broadcast_tag_canvas(tag, {"type":"tag_canvas_participants","tag":tag,"count":len(canvas.participants)})
            except Exception:
                pass
            prune_tag_canvas_if_idle(tag)
    # If in chat
    chat_id = user_chat.get(user_id)
    if chat_id:
        chat = active_chats.get(chat_id)
        if chat:
            partner = chat['a'] if chat['b'] == user_id else chat['b']
            if notify_partner:
                pws = user_ws.get(partner)
                if pws:
                    await pws.send_json({"type": "partner_disconnected"})
            # cleanup partner chat ref (they can choose to requeue client side)
            user_chat[partner] = None
        active_chats.pop(chat_id, None)
    user_chat[user_id] = None
    # remove ws mapping (do not close here, caller handles exceptions)
    user_ws.pop(user_id, None)
    user_mode.pop(user_id, None)
    user_tags.pop(user_id, None)

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    user_id = str(uuid.uuid4())
    user_ws[user_id] = ws
    user_chat[user_id] = None
    await ws.send_json({"type": "welcome", "userId": user_id})
    # Immediately broadcast new population
    await broadcast_population()
    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")

            if msg_type == 'join':
                # Reset/override mode to random and (re)enter queue.
                # If currently in a chat, treat this as an implicit skip: disconnect partner and cleanup first.
                user_mode[user_id] = 'random'
                existing_chat = user_chat.get(user_id)
                if existing_chat:
                    chat = active_chats.get(existing_chat)
                    if chat:
                        partner = chat['a'] if chat['b'] == user_id else chat['b']
                        pws = user_ws.get(partner)
                        if pws:
                            await pws.send_json({"type": "partner_disconnected"})
                        user_chat[partner] = None
                        active_chats.pop(existing_chat, None)
                    user_chat[user_id] = None
                await leave_queue(user_id)
                async with PAIR_LOCK:
                    await pair_user(user_id)
                # Only report 'paired' after an explicit paired event has been sent; queue_status here reflects waiting state only.
                await ws.send_json({"type": "queue_status", "status": "in_chat" if user_chat[user_id] else "waiting"})
                await broadcast_tag_counts()

            elif msg_type == 'join_with_tags':
                tags_raw = data.get('tags', [])
                norm: Set[str] = set()
                for t in tags_raw:
                    if isinstance(t, str):
                        tt = t.strip().lower()
                        if tt:
                            norm.add(tt)
                user_mode[user_id] = 'tags'
                user_tags[user_id] = norm
                # End any existing chat (implicit skip)
                existing_chat = user_chat.get(user_id)
                if existing_chat:
                    chat = active_chats.get(existing_chat)
                    if chat:
                        partner = chat['a'] if chat['b'] == user_id else chat['b']
                        pws = user_ws.get(partner)
                        if pws:
                            await pws.send_json({"type": "partner_disconnected"})
                        user_chat[partner] = None
                        active_chats.pop(existing_chat, None)
                    user_chat[user_id] = None
                await leave_queue(user_id)
                async with PAIR_LOCK:
                    await pair_user(user_id)
                await ws.send_json({"type": "queue_status", "status": "in_chat" if user_chat[user_id] else "waiting"})
                await broadcast_tag_counts()

            elif msg_type == 'skip':
                # Disconnect from current chat but stay in same mode and immediately requeue
                chat_id = user_chat.get(user_id)
                if chat_id:
                    chat = active_chats.get(chat_id)
                    if chat:
                        partner = chat['a'] if chat['b'] == user_id else chat['b']
                        pws = user_ws.get(partner)
                        if pws:
                            await pws.send_json({"type": "partner_disconnected"})
                    active_chats.pop(chat_id, None)
                user_chat[user_id] = None
                async with PAIR_LOCK:
                    await pair_user(user_id)
                await ws.send_json({"type": "queue_status", "status": "in_chat" if user_chat[user_id] else "waiting"})
                await broadcast_tag_counts()

            elif msg_type == 'message':
                chat_id = user_chat.get(user_id)
                if not chat_id:
                    continue
                chat = active_chats.get(chat_id)
                if not chat:
                    continue
                text = data.get('text', '')
                partner = chat['a'] if chat['b'] == user_id else chat['b']
                pws = user_ws.get(partner)
                if pws:
                    await pws.send_json({"type": "message", "text": text})

            elif msg_type == 'typing':
                chat_id = user_chat.get(user_id)
                if not chat_id:
                    continue
                chat = active_chats.get(chat_id)
                if not chat:
                    continue
                preview = data.get('preview', '')
                partner = chat['a'] if chat['b'] == user_id else chat['b']
                pws = user_ws.get(partner)
                if pws:
                    await pws.send_json({"type": "typing", "preview": preview})

            # ===== Tag Canvas Collaboration =====
            elif msg_type == 'open_tag_canvas':
                tag = data.get('tag','').strip().lower()
                if not tag:
                    continue
                # Relaxed access control: allow any connected user to open; participation itself is gating.
                canvas = get_tag_canvas(tag)
                canvas.participants.add(user_id)
                canvas.last_updated = time.time()
                # Snapshot payload
                snapshot = {
                    "type":"tag_canvas_snapshot",
                    "tag": tag,
                    "strokes": canvas.strokes,
                    "texts": list(canvas.texts.values())
                }
                try:
                    await ws.send_json(snapshot)
                except Exception:
                    pass
                # Broadcast participants count
                await broadcast_tag_canvas(tag, {"type":"tag_canvas_participants","tag":tag,"count":len(canvas.participants)})

            elif msg_type == 'close_tag_canvas':
                tag = data.get('tag','').strip().lower()
                if not tag:
                    continue
                c = tag_canvases.get(tag)
                if not c:
                    continue
                if user_id in c.participants:
                    c.participants.discard(user_id)
                    c.last_updated = time.time()
                    await broadcast_tag_canvas(tag, {"type":"tag_canvas_participants","tag":tag,"count":len(c.participants)})

            elif msg_type == 'tag_canvas_stroke':
                tag = data.get('tag','').strip().lower()
                stroke = data.get('stroke') or {}
                if not tag or not stroke:
                    continue
                c = get_tag_canvas(tag)
                if user_id not in c.participants:
                    continue
                # Create canonical stroke id
                sid = str(uuid.uuid4())
                tmp_id = stroke.get('tmpId')
                # Normalize points
                pts = stroke.get('points') or []
                # Limit points to avoid over-sized messages
                if len(pts) > 2000:
                    pts = pts[:2000]
                new_stroke = {
                    "id": sid,
                    "tmpId": tmp_id,
                    "color": stroke.get('color', '#ffffff'),
                    "w": float(stroke.get('w', 2.0)),
                    "points": pts
                }
                c.strokes.append(new_stroke)
                if len(c.strokes) > MAX_STROKES_PER_TAG:
                    # drop oldest
                    c.strokes = c.strokes[-MAX_STROKES_PER_TAG:]
                c.last_updated = time.time()
                await broadcast_tag_canvas(tag, {"type":"tag_canvas_stroke","tag":tag,"stroke":new_stroke})

            elif msg_type == 'tag_canvas_stroke_delete':
                tag = data.get('tag','').strip().lower()
                sid = data.get('id')
                if not tag or not sid:
                    continue
                c = tag_canvases.get(tag)
                if not c or user_id not in c.participants:
                    continue
                # find and remove stroke
                idx = next((i for i,s in enumerate(c.strokes) if s.get('id')==sid), None)
                if idx is None:
                    continue
                c.strokes.pop(idx)
                c.last_updated = time.time()
                await broadcast_tag_canvas(tag, {"type":"tag_canvas_stroke_delete","tag":tag,"id":sid})

            elif msg_type == 'disconnect':
                await disconnect_user(user_id)
                await broadcast_tag_counts()
                break

    except WebSocketDisconnect:
        await disconnect_user(user_id)
        await broadcast_tag_counts()
        await broadcast_population()
    except Exception:
        await disconnect_user(user_id)
        await broadcast_tag_counts()
        await broadcast_population()

"""HTTP Routes for serving the frontend pages"""

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

def _page(path: str) -> FileResponse:
    return FileResponse(os.path.join(FRONTEND_DIR, path))

@app.get("/", response_class=HTMLResponse)
async def index_page():
    return _page('index.html')

@app.get("/home", response_class=HTMLResponse)
async def home_page():
    return _page('home.html')

@app.get("/chat", response_class=HTMLResponse)
async def chat_page():
    return _page('chat.html')
