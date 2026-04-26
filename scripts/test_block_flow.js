const BASE = "http://localhost:3000";
const userA = {
  email: "lehuuphuc6573@gmail.com",
  password: "11111111",
  deviceId: "test-device-A",
};
const userB = {
  email: "huuphucl273@gmail.com",
  password: "22222222",
  deviceId: "test-device-B",
};

async function req(path, opts = {}) {
  const url = BASE + path;
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    body = text;
  }
  return { status: res.status, body };
}

(async () => {
  console.log("Logging in User A...");
  let r = await req("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: userA.email,
      password: userA.password,
      deviceId: userA.deviceId,
    }),
  });
  console.log("User A login:", r.status, r.body);
  if (r.body && r.body.requireOtp) {
    console.error("User A requires OTP. Aborting.");
    process.exit(2);
  }
  const tokenA = r.body?.accessToken;

  console.log("Logging in User B...");
  r = await req("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: userB.email,
      password: userB.password,
      deviceId: userB.deviceId,
    }),
  });
  console.log("User B login:", r.status, r.body);
  if (r.body && r.body.requireOtp) {
    console.error("User B requires OTP. Aborting.");
    process.exit(2);
  }
  const tokenB = r.body?.accessToken;

  if (!tokenA || !tokenB) {
    console.error("Missing tokens. Aborting.");
    process.exit(3);
  }

  console.log("User A blocks User B");
  r = await req("/chat/friends/block", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + tokenA,
    },
    body: JSON.stringify({ targetEmail: userB.email }),
  });
  console.log("Block response:", r.status, r.body);

  console.log("User B creates/gets direct conversation with A");
  r = await req("/chat/conversations/direct", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + tokenB,
    },
    body: JSON.stringify({ targetEmail: userA.email }),
  });
  console.log("Direct conv response:", r.status, r.body);
  const convId =
    r.body?.conversation?.id || r.body?.id || r.body?.conversationId;
  console.log("convId=", convId);

  console.log("User B attempts to send message to A (should be blocked)");
  r = await req(`/chat/conversations/${convId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + tokenB,
    },
    body: JSON.stringify({ content: "Hello from B while blocked" }),
  });
  console.log("Send attempt 1:", r.status, r.body);

  console.log("User A unblocks User B");
  r = await req("/chat/friends/unblock", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + tokenA,
    },
    body: JSON.stringify({ targetEmail: userB.email }),
  });
  console.log("Unblock response:", r.status, r.body);

  console.log("User B attempts to send message to A (after unblock)");
  r = await req(`/chat/conversations/${convId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + tokenB,
    },
    body: JSON.stringify({ content: "Hello from B after unblock" }),
  });
  console.log("Send attempt 2:", r.status, r.body);

  process.exit(0);
})();
