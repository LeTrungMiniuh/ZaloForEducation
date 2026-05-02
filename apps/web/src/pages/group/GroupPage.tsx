import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useChatStore } from "../../store/chatStore";
import { getDisplayName, getDisplayAvatar } from "../../utils/chatUtils";
import {
  X,
  Users,
  Search,
  CheckCircle2,
  UserPlus,
  Loader2,
  Camera,
  ArrowLeft,
} from "lucide-react";
import Swal from "sweetalert2";
import api from "../../services/api";

const GroupPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    createGroupConversation,
    setActiveConversation,
    conversations,
    userProfiles,
  } = useChatStore();

  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const [friends, setFriends] = useState<
    {
      email: string;
      displayName: string;
      avatarUrl: string;
      fullName?: string;
    }[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("Tất cả");

  const categories = ["Tất cả", "Gia đình", "Công việc", "Học tập"];

  const fetchFriends = useCallback(() => {
    setTimeout(() => {
      const contactsMap = new Map<
        string,
        { email: string; displayName: string; avatarUrl: string }
      >();

      conversations.forEach((c) => {
        if (c.type === "direct") {
          const partnerEmail = c.members?.find(
            (m: string) => m !== user?.email,
          );
          if (partnerEmail && partnerEmail !== user?.email) {
            contactsMap.set(partnerEmail, {
              email: partnerEmail,
              displayName: getDisplayName(partnerEmail, user, userProfiles),
              avatarUrl: getDisplayAvatar(partnerEmail, user, userProfiles),
            });
          }
        } else if (c.type === "group") {
          c.members?.forEach((m: string) => {
            if (m !== user?.email && !contactsMap.has(m)) {
              contactsMap.set(m, {
                email: m,
                displayName: getDisplayName(m, user, userProfiles),
                avatarUrl: getDisplayAvatar(m, user, userProfiles),
              });
            }
          });
        }
      });

      setFriends(Array.from(contactsMap.values()));
      setIsLoading(false);
    }, 100);
  }, [conversations, user, userProfiles]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      fetchFriends();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchFriends]);

  const handleToggle = (email: string) => {
    const next = new Set(selectedIds);
    if (next.has(email)) {
      next.delete(email);
    } else {
      next.add(email);
    }
    setSelectedIds(next);
  };

  const handleRemoveSelected = (email: string) => {
    const next = new Set(selectedIds);
    next.delete(email);
    setSelectedIds(next);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = async () => {
    if (selectedIds.size < 2) {
      Swal.fire("Lỗi", "Vui lòng chọn ít nhất 2 thành viên", "error");
      return;
    }
    if (!groupName.trim()) {
      Swal.fire("Lỗi", "Vui lòng nhập tên nhóm", "error");
      return;
    }

    setIsCreating(true);
    try {
      let avatarUrl = "";
      if (avatarFile) {
        const formData = new FormData();
        formData.append("file", avatarFile);
        const uploadRes = await api.post("/chat/uploads", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        avatarUrl = uploadRes.data.fileUrl || uploadRes.data.dataUrl || "";
      }

      const members = Array.from(selectedIds);
      const newGroup = await createGroupConversation(
        groupName.trim(),
        members,
        avatarUrl,
      );
      const convId = newGroup?.id || newGroup?._id || newGroup?.convId;
      if (convId) {
        setActiveConversation(convId);
      }

      await Swal.fire({
        title: "Đã tạo nhóm",
        text: `Bạn đã tạo nhóm ${groupName.trim()}`,
        icon: "success",
        timer: 1600,
        showConfirmButton: false,
      });

      navigate("/chat", { replace: true });
    } catch {
      Swal.fire("Thất bại", "Không thể tạo nhóm. Vui lòng thử lại.", "error");
    } finally {
      setIsCreating(false);
    }
  };

  const filtered = friends.filter((f) =>
    (f.displayName || f.email).toLowerCase().includes(search.toLowerCase()),
  );

  const selectedMembersList = friends.filter((f) => selectedIds.has(f.email));

  return (
    <div className="flex flex-col h-screen w-full bg-white dark:bg-surface-container-lowest">
      {/* Header */}
      <div className="px-5 py-4 border-b border-outline-variant/10 dark:border-outline-variant/20 flex items-center justify-between sticky top-0 z-10 bg-white dark:bg-surface-container-lowest">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/chat")}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors"
          >
            <ArrowLeft size={20} className="text-on-surface" />
          </button>
          <h1 className="text-[18px] font-extrabold text-on-surface flex items-center gap-2">
            <Users size={20} className="text-primary" />
            Tạo nhóm
          </h1>
        </div>
        <button
          onClick={() => navigate("/chat")}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors"
        >
          <X size={20} className="text-on-surface-variant" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Top Section: Avatar + Group Name */}
        <div className="px-5 py-4 border-b border-outline-variant/10 space-y-4">
          <div className="flex items-start gap-4">
            {/* Avatar Upload */}
            <div className="relative group">
              <div className="w-20 h-20 rounded-2xl bg-surface-container-high flex items-center justify-center overflow-hidden border-2 border-outline-variant/20 group-hover:border-primary/30 transition-all shrink-0">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    className="w-full h-full object-cover"
                    alt="preview"
                  />
                ) : (
                  <Camera
                    size={28}
                    className="text-on-surface-variant/50 group-hover:text-primary transition-colors"
                  />
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="absolute inset-0 opacity-0 cursor-pointer rounded-2xl"
              />
            </div>

            {/* Group Name Input */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-bold text-on-surface">
                  Tên nhóm
                </label>
                <span className="text-[11px] text-on-surface-variant">
                  {groupName.length}/50
                </span>
              </div>
              <input
                autoFocus
                value={groupName}
                onChange={(e) => setGroupName(e.target.value.slice(0, 50))}
                placeholder="Nhập tên nhóm..."
                maxLength={50}
                className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-[14px] font-medium placeholder:text-on-surface-variant/50"
              />
            </div>
          </div>

          {/* Search & Categories */}
          <div className="space-y-2">
            <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl flex items-center px-4 py-2 gap-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <Search
                size={18}
                className="text-on-surface-variant/50 shrink-0"
              />
              <input
                type="text"
                placeholder="Nhập tên, số điện thoại, hoặc danh sách số điện thoại"
                className="bg-transparent flex-1 outline-none text-[14px] text-on-surface placeholder:text-on-surface-variant/50"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Quick Filter Categories */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-full text-[13px] font-bold whitespace-nowrap transition-all shrink-0 ${
                    selectedCategory === cat
                      ? "bg-primary text-white"
                      : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content: Two Columns */}
        <div className="flex-1 overflow-hidden flex gap-4 px-4 py-4">
          {/* Left: Member List */}
          <div className="flex-1 flex flex-col min-w-0 border border-outline-variant/10 rounded-2xl overflow-hidden bg-surface-container-lowest">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <Loader2 size={24} className="text-primary animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4 opacity-50">
                  <Users
                    size={32}
                    className="text-on-surface-variant/30 mb-2"
                  />
                  <p className="text-[13px]">
                    {search
                      ? "Không tìm thấy người dùng nào"
                      : "Không có danh bạ"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {filtered.map((f) => {
                    const isSelected = selectedIds.has(f.email);
                    return (
                      <div
                        key={f.email}
                        onClick={() => handleToggle(f.email)}
                        className={`flex items-center p-3 gap-3 rounded-2xl cursor-pointer transition-all ${
                          isSelected
                            ? "bg-primary/10"
                            : "hover:bg-surface-container-high"
                        }`}
                      >
                        <img
                          src={f.avatarUrl || "/avatar_placeholder.png"}
                          className="w-10 h-10 rounded-full object-cover ring-1 ring-black/5 shrink-0"
                          alt=""
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[14px] font-bold text-on-surface truncate">
                            {f.displayName || f.fullName || f.email}
                          </h3>
                          {f.displayName && (
                            <p className="text-[12px] text-on-surface-variant truncate">
                              {f.email}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0">
                          {!isSelected && (
                            <div className="w-5 h-5 rounded-full border-2 border-outline-variant/30" />
                          )}
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <CheckCircle2 size={14} className="text-white" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Selected Members */}
          <div className="w-56 flex flex-col border border-outline-variant/10 rounded-2xl overflow-hidden bg-surface-container-lowest">
            {/* Header */}
            <div className="px-4 py-3 border-b border-outline-variant/10 bg-surface-container-high">
              <p className="text-[13px] font-bold text-on-surface">
                Đã chọn{" "}
                <span className="text-primary text-[15px] font-extrabold">
                  {selectedIds.size}/100
                </span>
              </p>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {selectedMembersList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4 opacity-50">
                  <Users
                    size={24}
                    className="text-on-surface-variant/30 mb-2"
                  />
                  <p className="text-[12px]">Chưa chọn thành viên</p>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {selectedMembersList.map((member) => (
                    <div
                      key={member.email}
                      className="flex items-center gap-2 p-2 bg-primary/5 rounded-xl group"
                    >
                      <img
                        src={member.avatarUrl || "/avatar_placeholder.png"}
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-black/5 shrink-0"
                        alt=""
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-on-surface truncate">
                          {member.displayName ||
                            member.fullName ||
                            member.email}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveSelected(member.email)}
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X size={14} className="text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer: Action Buttons */}
      <div className="px-5 py-4 border-t border-outline-variant/10 dark:border-outline-variant/20 bg-surface-container-lowest flex flex-col gap-3">
        {selectedIds.size < 2 && (
          <p className="text-[12px] text-red-500 font-medium">
            ⚠️ Vui lòng chọn ít nhất 2 thành viên
          </p>
        )}
        {!groupName.trim() && (
          <p className="text-[12px] text-red-500 font-medium">
            ⚠️ Vui lòng nhập tên nhóm
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/chat")}
            className="flex-1 px-6 py-3 bg-surface-container-high text-on-surface rounded-full hover:bg-surface-container-highest font-bold text-[14px] transition-all"
          >
            Hủy
          </button>
          <button
            onClick={handleCreate}
            disabled={selectedIds.size < 2 || !groupName.trim() || isCreating}
            className="flex-1 px-6 py-3 bg-primary text-white rounded-full hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-[14px] flex items-center justify-center gap-2 shadow-md shadow-primary/20"
          >
            {isCreating ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <UserPlus size={18} />
            )}
            Tạo nhóm
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupPage;
