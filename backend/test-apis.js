require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const t = require('telnyx')(process.env.TELNYX_API_KEY);

Promise.all([
  t.balance.retrieve(),
  t.phoneNumbers.list({ page: { size: 5 } })
]).then(([b, n]) => {\n  console.log(JSON.stringify({\n    balance: b.data,\n    numbers: n.data?.slice(0, 3).map(x => ({\n      phone: x.phone_number,\n      status: x.status\n    }))\n  }, null, 2));\n}).catch(e => {\n  console.log(JSON.stringify({\n    error: e?.response?.data?.errors?.[0]?.detail || e.message,\n    status: e?.response?.status\n  }, null, 2));\n});
