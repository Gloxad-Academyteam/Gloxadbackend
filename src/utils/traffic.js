// Request counts per minute, kept in memory for the admin live view.
// They cover this server process only and start again at zero after a restart.
const MINUTE = 60 * 1000;
const KEEP_MINUTES = 60;
const buckets = new Map(); // minute -> { requests, errors, serverErrors }

export const recordRequest = (status) => {
  const minute = Math.floor(Date.now() / MINUTE);
  const bucket = buckets.get(minute) || { requests: 0, errors: 0, serverErrors: 0 };
  bucket.requests += 1;
  if (status >= 400) bucket.errors += 1;
  if (status >= 500) bucket.serverErrors += 1;
  buckets.set(minute, bucket);
  if (buckets.size > KEEP_MINUTES + 5) {
    const oldest = minute - KEEP_MINUTES;
    for (const key of buckets.keys()) if (key < oldest) buckets.delete(key);
  }
};

export const trafficSummary = (minutes = 30) => {
  const now = Math.floor(Date.now() / MINUTE);
  const series = [];
  let requests = 0;
  let errors = 0;
  let serverErrors = 0;
  for (let i = minutes - 1; i >= 0; i -= 1) {
    const minute = now - i;
    const bucket = buckets.get(minute) || { requests: 0, errors: 0, serverErrors: 0 };
    series.push({ at: new Date(minute * MINUTE).toISOString(), requests: bucket.requests, errors: bucket.errors });
    requests += bucket.requests;
    errors += bucket.errors;
    serverErrors += bucket.serverErrors;
  }
  const last5 = series.slice(-5).reduce((sum, point) => sum + point.requests, 0);
  return { series, requests, errors, serverErrors, requestsLast5m: last5, perMinute: Math.round((last5 / 5) * 10) / 10 };
};
