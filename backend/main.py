
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

# ========== NEETBOARD MULTIPLAYER (BASIC) =============
# In-memory board state for neetboard (branches only)
neetboard_state = {
    "branches": []  # list of dicts: {id, text, x, y, parentId}
}
neetboard_clients = set()

def get_neetboard_online_count():
    return len(neetboard_clients)

# ========== BLOG BOARD STORAGE =============
from datetime import datetime
from typing import List, Dict, Any
import uuid

# In-memory blog post storage
blog_posts: List[Dict[str, Any]] = []
blog_clients = set()  # WebSocket connections for blog board

class BlogPost:
    def __init__(self, content: str):
        self.id = str(uuid.uuid4())
        self.content = content
        self.timestamp = datetime.now().isoformat()
        self.created_at = datetime.now()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "content": self.content,
            "timestamp": self.timestamp,
            "created_at": self.created_at.isoformat()
        }

from fastapi import WebSocket
import json

@app.websocket("/ws/neetboard")
async def neetboard_ws(websocket: WebSocket):
    await websocket.accept()
    neetboard_clients.add(websocket)
    # Send current state
    await websocket.send_text(json.dumps({"type": "init", "branches": neetboard_state["branches"], "online": get_neetboard_online_count()}))
    # Broadcast new online count
    for ws in list(neetboard_clients):
        try:
            await ws.send_text(json.dumps({"type": "online", "online": get_neetboard_online_count()}))
        except Exception:
            neetboard_clients.discard(ws)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "update":
                # Replace state and broadcast
                neetboard_state["branches"] = msg["branches"]
                for ws in list(neetboard_clients):
                    try:
                        await ws.send_text(json.dumps({"type": "update", "branches": neetboard_state["branches"]}))
                        await ws.send_text(json.dumps({"type": "online", "online": get_neetboard_online_count()}))
                    except Exception:
                        neetboard_clients.discard(ws)
    except Exception:
        neetboard_clients.discard(websocket)
        # Broadcast new online count
        for ws in list(neetboard_clients):
            try:
                await ws.send_text(json.dumps({"type": "online", "online": get_neetboard_online_count()}))
            except Exception:
                neetboard_clients.discard(ws)

@app.websocket("/ws/blogboard")
async def blogboard_ws(websocket: WebSocket):
    await websocket.accept()
    blog_clients.add(websocket)
    
    # Send initial blog posts to new client
    try:
        await websocket.send_text(json.dumps({
            "type": "init",
            "posts": blog_posts
        }))
    except Exception:
        blog_clients.discard(websocket)
        return
    
    try:
        # Keep connection alive - blog board is read-only via WebSocket
        # Posts are created via REST API and broadcasted
        while True:
            # Just wait for messages to keep connection alive
            await websocket.receive_text()
    except Exception:
        blog_clients.discard(websocket)

async def broadcast_new_post(post_data: Dict[str, Any]):
    """Broadcast new blog post to all connected clients"""
    if not blog_clients:
        return
    
    message = json.dumps({
        "type": "new_post",
        "post": post_data
    })
    
    # Send to all connected blog clients
    disconnected_clients = []
    for websocket in list(blog_clients):
        try:
            await websocket.send_text(message)
        except Exception:
            disconnected_clients.append(websocket)
    
    # Clean up disconnected clients
    for websocket in disconnected_clients:
        blog_clients.discard(websocket)

# --- Periodic Cleanup Task for Stale Users/Sessions ---
STALE_WS_TIMEOUT = 60  # seconds
async def cleanup_stale_users():
    while True:
        await asyncio.sleep(10)
        stale = []
        for uid, ws in list(user_ws.items()):
            # If the websocket is closed or dead, mark for removal
            if ws.client_state.name != 'CONNECTED':
                stale.append(uid)
        for uid in stale:
            await disconnect_user(uid, notify_partner=True)
        # Clean up tag canvases with no participants
        for tag in list(tag_canvases.keys()):
            prune_tag_canvas_if_idle(tag)
        await broadcast_population()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_stale_users())

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data structures
def get_available_users():
    # Users not in a chat (any mode)
    return [uid for uid, ws in user_ws.items() if ws.client_state.name == 'CONNECTED' and user_chat.get(uid) is None]

async def broadcast_available_users():
    users = get_available_users()
    payload = {"type": "available_users", "users": [{"id": uid} for uid in users]}
    print(f"[BROADCAST] available_users: {[u['id'] for u in payload['users']]}")
    for ws in user_ws.values():
        try:
            await ws.send_json(payload)
        except Exception:
            pass

async def broadcast_available_users_to_client(ws: WebSocket):
    """Send available users to a specific client"""
    users = get_available_users()
    payload = {"type": "available_users", "users": [{"id": uid} for uid in users]}
    print(f"[SEND TO CLIENT] available_users: {[u['id'] for u in payload['users']]}")
    try:
        await ws.send_json(payload)
    except Exception:
        pass
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
    # Only count users with a live websocket connection
    total = sum(1 for ws in user_ws.values() if ws.client_state.name == 'CONNECTED')
    if not user_ws:
        return
    payload = {"type":"population", "count": total}
    print(f"[BROADCAST] population: {total}")
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
    user_id = None
    
    # Wait for either register_user message or use generated ID as fallback
    try:
        # Try to receive initial message within 5 seconds
        import asyncio
        initial_data = await asyncio.wait_for(ws.receive_json(), timeout=5.0)
        if initial_data.get("type") == "register_user" and initial_data.get("userId"):
            user_id = initial_data["userId"]
        else:
            # If not a register_user message, we'll need to handle it later
            user_id = str(uuid.uuid4())
            # Put the message back in the queue by handling it after setup
            pending_message = initial_data
    except (asyncio.TimeoutError, Exception):
        # Fallback to generated ID if no message received or error
        user_id = str(uuid.uuid4())
        pending_message = None
    
    if not user_id:
        user_id = str(uuid.uuid4())
        
    user_ws[user_id] = ws
    user_chat[user_id] = None
    await ws.send_json({"type": "welcome", "userId": user_id})
    # Immediately broadcast new population
    await broadcast_population()
    await broadcast_available_users()
    
    # Handle pending message if there was one that wasn't register_user
    if 'pending_message' in locals() and pending_message:
        # Process this message in the main loop
        data = pending_message
        msg_type = data.get("type")
        # Handle the message here (duplicate the logic from below)
        if msg_type == 'join':
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
            await ws.send_json({"type": "queue_status", "status": "in_chat" if user_chat[user_id] else "waiting"})
            await broadcast_tag_counts()
            await broadcast_available_users()
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
                await broadcast_available_users()
                await broadcast_population()

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
                await broadcast_available_users()
                await broadcast_population()

            elif msg_type == 'register_user':
                # Handle late register_user messages (should be rare due to initial handling)
                provided_user_id = data.get('userId')
                if provided_user_id and provided_user_id != user_id:
                    # User is trying to change their ID after connection - ignore for security
                    pass

            elif msg_type == 'request_available_users':
                # Send current available users to this client
                await broadcast_available_users_to_client(ws)

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
                await broadcast_available_users()
                await broadcast_population()
            elif msg_type == 'request_user_chat':
                # User clicked a circle to request a chat with a specific user
                target_id = data.get('userId')
                # Only allow if both are available and not in a chat (any mode)
                if target_id and user_chat.get(user_id) is None and user_chat.get(target_id) is None:
                    await establish_chat(user_id, target_id, matched_tags=set())
                    await broadcast_available_users()
                # else: ignore silently

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
        await broadcast_available_users()
    except Exception:
        await disconnect_user(user_id)
        await broadcast_available_users()
        await broadcast_tag_counts()
        await broadcast_population()

# ========== BLOG API ENDPOINTS =============
from fastapi import HTTPException
from pydantic import BaseModel

class BlogPostCreate(BaseModel):
    content: str

class BlogPostResponse(BaseModel):
    id: str
    content: str
    timestamp: str
    created_at: str

@app.post("/api/blog/posts", response_model=BlogPostResponse)
async def create_blog_post(post_data: BlogPostCreate):
    """Create a new blog post"""
    if not post_data.content or not post_data.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")
    
    # Count words (simple word count)
    word_count = len(post_data.content.strip().split())
    if word_count < 200:
        raise HTTPException(status_code=400, detail="Blog post must be at least 200 words")
    
    # Create new blog post
    new_post = BlogPost(post_data.content.strip())
    post_dict = new_post.to_dict()
    blog_posts.append(post_dict)
    
    # Sort posts by creation time (newest first)
    blog_posts.sort(key=lambda x: x['created_at'], reverse=True)
    
    # Broadcast new post to all connected WebSocket clients
    await broadcast_new_post(post_dict)
    
    return BlogPostResponse(**post_dict)

@app.get("/api/blog/posts")
async def get_blog_posts():
    """Get all blog posts, sorted by newest first"""
    return {
        "posts": blog_posts,
        "total": len(blog_posts)
    }

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

# Serve neetboard.html at /neetboard
@app.get("/neetboard", response_class=HTMLResponse)
async def neetboard_page():
    return _page('neetboard.html')

# Serve blogboard.html at /blogboard
@app.get("/blogboard", response_class=HTMLResponse)
async def blogboard_page():
    return _page('blogboard.html')
