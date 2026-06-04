function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withExponentialBackoff(fn, { retries = 3, baseMs = 250, maxMs = 2000, onRetry } = {}) {
  let attempt = 0;
  // attempt 0 = initial try, then retries additional times
  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = Math.min(maxMs, baseMs * 2 ** attempt);
      if (typeof onRetry === "function") onRetry({ attempt, delay, err });
      await sleep(delay);
      attempt += 1;
    }
  }
}

module.exports = { withExponentialBackoff };

