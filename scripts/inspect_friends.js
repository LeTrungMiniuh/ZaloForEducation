const fetch = global.fetch || require("node-fetch");
const base = "http://localhost:3000";
const tokenA = process.argv[2];
const tokenB = process.argv[3];
const target = process.argv[4] || "huuphucl273@gmail.com";
(async () => {
  if (!tokenA || !tokenB)
    return console.error(
      "Usage: node inspect_friends.js <tokenA> <tokenB> [targetEmail]",
    );
  const a = await (
    await fetch(base + "/chat/friends", {
      headers: { Authorization: "Bearer " + tokenA },
    })
  ).json();
  const b = await (
    await fetch(base + "/chat/friends", {
      headers: { Authorization: "Bearer " + tokenB },
    })
  ).json();
  console.log("A friends entries containing target:");
  console.log(
    a.filter((x) => x.receiver_id === target || x.sender_id === target),
  );
  console.log("B friends entries containing target:");
  console.log(
    b.filter((x) => x.receiver_id === target || x.sender_id === target),
  );
})();
