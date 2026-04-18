import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

type Friendship = {
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "blocked";
  nickname?: string;
  createdAt?: string;
  updatedAt?: string;
  senderProfile?: {
    email: string;
    fullName?: string;
    fullname?: string;
    avatarUrl?: string;
  };
};

type FriendSuggestion = {
  email: string;
  fullName: string;
  avatarUrl?: string;
  mutualFriendCount: number;
  mutualFriends: string[];
  sharedGroups: string[];
  reasons: string[];
};

const chatGet = async (path: string, params?: any) => {
  try {
    return await api.get(`/chat${path}`, { params });
  } catch {
    return await api.get(`/api/chat${path}`, { params });
  }
};

const chatPost = async (path: string, body: any) => {
  try {
    return await api.post(`/chat${path}`, body);
  } catch {
    return await api.post(`/api/chat${path}`, body);
  }
};

const FriendRequestForm: React.FC = () => {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const myEmail = user?.email || "";

  const incomingRequests = useMemo(
    () =>
      friendships.filter(
        (f) =>
          f.status === "pending" &&
          f.receiver_id === myEmail &&
          f.sender_id !== myEmail,
      ),
    [friendships, myEmail],
  );

  const acceptedFriends = useMemo(
    () => friendships.filter((f) => f.status === "accepted"),
    [friendships],
  );

  const loadFriendships = async () => {
    const [friendRes, suggestionRes] = await Promise.all([
      chatGet("/friends"),
      chatGet("/friends/suggestions"),
    ]);

    setFriendships(Array.isArray(friendRes.data) ? friendRes.data : []);
    setSuggestions(Array.isArray(suggestionRes.data) ? suggestionRes.data : []);
  };

  const handleSearch = async () => {
    if (!email.trim()) {
      setMessage("Vui lòng nhập Gmail để tìm kiếm.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await chatGet("/friends/search", { email });
      setSearchResult(res.data);
      if (!res.data?.found) {
        setMessage("Không tìm thấy tài khoản phù hợp.");
      }
    } catch (err: any) {
      setSearchResult(null);
      setMessage(err?.response?.data?.message || "Tìm kiếm thất bại.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async (targetEmail: string) => {
    setLoading(true);
    setMessage("");
    try {
      await chatPost("/friends/request", { targetEmail });
      setMessage("Đã gửi lời mời kết bạn.");
      await loadFriendships();
      await handleSearch();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Gửi lời mời thất bại.");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRequest = async (senderEmail: string) => {
    setLoading(true);
    setMessage("");
    try {
      await chatPost("/friends/accept", { senderEmail });
      setMessage("Đã chấp nhận lời mời kết bạn.");
      await loadFriendships();
      await handleSearch();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Chấp nhận lời mời thất bại.");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRequest = async (senderEmail: string) => {
    setLoading(true);
    setMessage("");
    try {
      await chatPost("/friends/reject", { senderEmail });
      setMessage("Đã từ chối lời mời kết bạn.");
      await loadFriendships();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Từ chối lời mời thất bại.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (!myEmail) return;
    loadFriendships().catch(() => null);
  }, [myEmail]);

  React.useEffect(() => {
    const handleFriendRequestReceived = () => {
      loadFriendships().catch(() => null);
    };

    const handleFriendshipUpdated = () => {
      loadFriendships().catch(() => null);
    };

    window.addEventListener(
      "friend-request-received",
      handleFriendRequestReceived,
    );
    window.addEventListener("friendship-updated", handleFriendshipUpdated);

    return () => {
      window.removeEventListener(
        "friend-request-received",
        handleFriendRequestReceived,
      );
      window.removeEventListener("friendship-updated", handleFriendshipUpdated);
    };
  }, []);

  const renderActionButton = () => {
    if (!searchResult?.found) return null;
    if (searchResult.isSelf) {
      return (
        <span className="text-sm text-slate-500">Đây là tài khoản của bạn</span>
      );
    }
    const friendship = searchResult.friendship;
    if (!friendship) {
      return (
        <button
          onClick={() => handleSendRequest(searchResult.user.email)}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Gửi lời mời
        </button>
      );
    }
    if (friendship.status === "accepted") {
      return <span className="text-green-600 font-medium">Đã là bạn bè</span>;
    }
    if (
      friendship.status === "pending" &&
      friendship.receiverEmail === myEmail
    ) {
      return (
        <button
          onClick={() => handleAcceptRequest(friendship.senderEmail)}
          className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
        >
          Chấp nhận lời mời
        </button>
      );
    }
    return (
      <span className="text-amber-600 font-medium">
        Đã gửi lời mời, chờ phản hồi
      </span>
    );
  };

  const totalFriends = acceptedFriends.length;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">
            Kết bạn theo Gmail
          </h1>
          <Link to="/chat" className="text-blue-600 hover:text-blue-700">
            Quay lại trang chat
          </Link>
        </div>

        <div className="flex gap-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Nhập Gmail cần tìm..."
            className="flex-1 border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-60"
          >
            Tìm
          </button>
        </div>

        {message && <p className="text-sm text-slate-600">{message}</p>}

        {searchResult?.found && (
          <div className="border border-slate-200 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">
                {searchResult.user.fullName}
              </p>
              <p className="text-sm text-slate-600">
                {searchResult.user.email}
              </p>
            </div>
            {renderActionButton()}
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Tổng số bạn bè
            </p>
            <p className="text-xs text-slate-500">{totalFriends} người</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-800">
              Đã nhận lời mời
            </p>
            <p className="text-xs text-slate-500">
              {incomingRequests.length} yêu cầu
            </p>
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-3">
            Lời mời kết bạn nhận được
          </h2>
          <div className="space-y-2">
            {incomingRequests.length === 0 && (
              <p className="text-sm text-slate-500">Chưa có lời mời nào.</p>
            )}
            {incomingRequests.map((request) => (
              <div
                key={request.sender_id}
                className="border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <img
                    src={request.senderProfile?.avatarUrl || "/logo_blue.png"}
                    alt={request.senderProfile?.fullName || request.sender_id}
                    className="w-12 h-12 rounded-full object-cover bg-slate-100"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">
                      {request.senderProfile?.fullName ||
                        request.senderProfile?.fullname ||
                        request.sender_id}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {request.sender_id}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleAcceptRequest(request.sender_id)}
                    className="px-3 py-1.5 rounded-xl bg-green-600 text-white hover:bg-green-700"
                  >
                    Chấp nhận
                  </button>
                  <button
                    onClick={() => handleRejectRequest(request.sender_id)}
                    className="px-3 py-1.5 rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300"
                  >
                    Từ chối
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-3">
            Suggested Friends
          </h2>
          <div className="space-y-2">
            {suggestions.length === 0 && (
              <p className="text-sm text-slate-500">Chưa có gợi ý phù hợp.</p>
            )}
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.email}
                className="border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <img
                    src={suggestion.avatarUrl || "/logo_blue.png"}
                    alt={suggestion.fullName}
                    className="w-12 h-12 rounded-full object-cover bg-slate-100"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">
                      {suggestion.fullName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {suggestion.email}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {suggestion.reasons.join(" • ") ||
                        "Gợi ý từ mạng lưới của bạn"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleSendRequest(suggestion.email)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-white hover:bg-slate-900"
                >
                  Kết bạn
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-3">
            Bạn bè đã kết nối
          </h2>
          <div className="space-y-2">
            {acceptedFriends.length === 0 && (
              <p className="text-sm text-slate-500">Chưa có bạn bè nào.</p>
            )}
            {acceptedFriends.map((friend) => {
              const otherEmail =
                friend.sender_id === myEmail
                  ? friend.receiver_id
                  : friend.sender_id;
              return (
                <div
                  key={otherEmail}
                  className="border border-slate-200 rounded-lg p-3"
                >
                  <span className="text-slate-700">{otherEmail}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FriendRequestForm;
