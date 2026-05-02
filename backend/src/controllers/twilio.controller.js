const { getNumbers, getBalance } = require("../services/twilio.service");

async function listNumbers(req, res, next) {
  try {
    const items = await getNumbers();
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

async function balance(req, res, next) {
  try {
    const b = await getBalance();
    res.json(b);
  } catch (err) {
    next(err);
  }
}

module.exports = { listNumbers, balance };
