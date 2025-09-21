# rot.tv5 Protocol (Draft)

## Client -> Server Messages

- `{"type":"join"}`: enter random queue.
- `{"type":"join_with_tags", "tags":["music","art"]}`: enter tag queue with given tags (case-insensitive normalized server side).
- `{"type":"skip"}`: leave current chat (if any) and immediately attempt requeue using previous mode/tags.
- `{"type":"message", "text":"hello"}`: send chat message to partner.
- `{"type":"typing", "preview":"partial text"}`: send live typing preview (every keystroke / throttled ~40ms client side).
- `{"type":"disconnect"}`: explicit disconnect (leave system entirely).

## Server -> Client Messages

- `{"type":"welcome", "userId":"..."}`: initial connection acknowledgment.
- `{"type":"queue_status", "status":"waiting|paired"}`: informs about waiting state after (re)join/skip.
- `{"type":"paired", "chatId":"...", "matchedTags":["music"]}`: chat established. `matchedTags` may be empty for random mode.
- `{"type":"message", "text":"hello"}`: received partner message.
- `{"type":"typing", "preview":"..."}`: partner's live typing preview.
- `{"type":"partner_disconnected"}`: partner left; UI should offer requeue or navigation.

## Notes / Future
- Add rate limiting, moderation, redis-backed queues for scale.
- Potential extension: single-sided WebRTC offer after pairing.
