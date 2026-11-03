const TYPE_ALIASES = new Map([
  ["comment", "comment"], ["chat", "comment"], ["tiktok.comment", "comment"], ["comment_received", "comment"],
  ["gift", "gift"], ["tiktok.gift", "gift"], ["gift_received", "gift"],
  ["like", "like"], ["tiktok.like", "like"], ["like_received", "like"],
  ["follow", "follow"], ["tiktok.follow", "follow"], ["followed", "follow"],
  ["share", "share"], ["tiktok.share", "share"], ["shared", "share"],
  ["join", "join"], ["member", "join"], ["tiktok.join", "join"], ["member_joined", "join"]
]);

let nextEventId = 1;

function readText(...values) {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== "");
  return value === undefined ? "" : String(value).trim();
}

function readCount(...values) {
  const value = Number(values.find((item) => item !== undefined && item !== null));
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function readCoinValue(...values) {
  const raw = values.find((item) => item !== undefined && item !== null && item !== "");
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function normalizeTikTokEvent(input) {
  if (!input || typeof input !== "object") return null;
  const source = input.data && typeof input.data === "object" ? input.data : input;
  const typeKey = readText(source.eventType, source.event, source.type, input.eventType, input.event, input.type).toLowerCase();
  const type = TYPE_ALIASES.get(typeKey);
  if (!type) return null;

  const teamValue = readText(source.team).toUpperCase();
  const timestamp = Number(source.timestamp ?? source.createTime ?? Date.now());
  return Object.freeze({
    id: readText(source.id, source.eventId) || `tiktok-${Date.now()}-${nextEventId++}`,
    type,
    username: readText(source.username, source.nickname, source.uniqueId, source.user?.nickname, source.user?.uniqueId) || "TikTok User",
    userId: readText(source.userId, source.secUid, source.user?.id, source.user?.secUid),
    avatarUrl: readText(source.avatarUrl, source.profilePictureUrl, source.user?.avatarUrl),
    comment: readText(source.comment, source.text, source.content),
    giftName: readText(source.giftName, source.gift?.name, source.gift?.giftName),
    giftId: readText(source.giftId, source.gift?.id),
    giftCount: readCount(source.giftCount, source.repeatCount, source.count),
    coinValue: readCoinValue(source.coinValue, source.giftCoinValue, source.diamondCount, source.gift?.coinValue, source.gift?.diamondCount),
    likeCount: readCount(source.likeCount, source.count),
    team: teamValue === "RED" || teamValue === "BLUE" ? teamValue : null,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now()
  });
}
