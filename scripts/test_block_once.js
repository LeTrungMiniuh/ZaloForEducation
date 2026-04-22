const base = "http://localhost:3000";
const fetch = global.fetch || require("node-fetch");
const tokenA = process.argv[2];
const tokenB = process.argv[3];
(async () => {
  if (!tokenA || !tokenB)
    return console.error("Usage: node test_block_once.js <tokenA> <tokenB>");
  console.log("Block B by A");
  let r = await fetch(base + "/chat/friends/block", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + tokenA,
    },
    body: JSON.stringify({ targetEmail: "huuphucl273@gmail.com" }),
  });
  console.log("block", r.status, await r.text());
  // Inspect friendship entries after block
  let fa = await fetch(base + "/chat/friends", {
    headers: { Authorization: "Bearer " + tokenA },
  });
  let fb = await fetch(base + "/chat/friends", {
    headers: { Authorization: "Bearer " + tokenB },
  });
  console.log("A friends after block:", await fa.text());
  console.log("B friends after block:", await fb.text());
  console.log("Create conv by B");
  r = await fetch(base + "/chat/conversations/direct", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + tokenB,
    },
    body: JSON.stringify({ targetEmail: "lehuuphuc6573@gmail.com" }),
  });
  let txt = await r.text();
  console.log("conv create", r.status, txt);
  let convId;
  try {
    convId = JSON.parse(txt).conversation.id;
  } catch (e) {
    try {
      convId = JSON.parse(txt).id;
    } catch (e) {
      convId = null;
    }
  }
  const enc = encodeURIComponent(convId);
  console.log("Try send (should be blocked)");
  r = await fetch(base + `/chat/conversations/${enc}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + tokenB,
    },
    body: JSON.stringify({ content: "Blocked test message" }),
  });
  console.log("send", r.status, await r.text());
})();
