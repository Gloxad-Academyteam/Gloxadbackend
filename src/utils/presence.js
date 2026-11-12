// Who has used the API recently. Kept in memory, so it covers this server process only and
// starts empty after a restart. It powers the admin "online now" numbers.
const seen = new Map(); // userId -> { at, role }
const KEEP_MS = 2 * 60 * 60 * 1000;
let lastPrune = Date.now();

export const touchPresence = (userId, role) => {
  const now = Date.now();
  seen.set(String(userId), { at: now, role });
  if (now - lastPrune > 5 * 60 * 1000) {
    lastPrune = now;
    for (const [id, entry] of seen) if (now - entry.at > KEEP_MS) seen.delete(id);
  }
};

export const presenceSummary = () => {
  const now = Date.now();
  const within = (ms) => {
    const counts = { total: 0, student: 0, instructor: 0, admin: 0 };
    for (const entry of seen.values()) {
      if (now - entry.at <= ms) {
        counts.total += 1;
        if (counts[entry.role] !== undefined) counts[entry.role] += 1;
      }
    }
    return counts;
  };
  return { now: within(5 * 60 * 1000), last15m: within(15 * 60 * 1000), last60m: within(60 * 60 * 1000) };
};
