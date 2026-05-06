import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BellOff,
  Bell,
  Clock3,
  Trash2,
  X,
  Check,
  ChevronDown,
  ChevronLeft,
  FileText,
  UserMinus,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Settings,
  Link,
  Plus,
  Camera,
  Loader2,
  Pin,
} from "lucide-react";
import Swal from "sweetalert2";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useChatStore } from "../../store/chatStore";
import {
  getDisplayAvatar,
  getDisplayName,
  normalizeAttachment,
  clearConversationMuteSchedule,
  createConversationMuteScheduleFromDuration,
  createConversationMuteScheduleUntilMorning,
  formatMuteScheduleLabel,
  getConversationMuteSchedule,
  setConversationMuteSchedule,
  type ConversationMuteSchedule,
} from "../../utils/chatUtils";
import AddMembersModal from "./AddMembersModal";
import AssetMediaGrid from "./AssetMediaGrid";
import AssetFileList from "./AssetFileList";
import AssetLinkList from "./AssetLinkList";

const ChatInfoSidebar: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    conversations,
    activeConvId,
    userProfiles,
    messages,
    setConversationAutoDelete,
    clearHistory,
    mutedConversations,
    muteConversationFor,
    clearConversationMuted,
    isConversationMuted,
    removeMember,
    updateMemberRole,
    updateGroupInfo,
    dissolveGroup,
    archiveAssets,
    fetchArchiveAssets,
  } = useChatStore();

  const activeChat = conversations.find((c) => c.id === activeConvId);

  // HEAD States
  const [viewMode, setViewMode] = useState<"info" | "archive">("info");
  const [activeStorageTab, setActiveStorageTab] = useState<
    "media" | "file" | "link"
  >("media");
  const [senderFilter, setSenderFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [showAutoDeleteModal, setShowAutoDeleteModal] = useState(false);
  const [pendingAutoDeleteDays, setPendingAutoDeleteDays] = useState<
    1 | 7 | 30 | null
  >(null);
  const [savingAutoDelete, setSavingAutoDelete] = useState(false);

  // tin_notification States
  const [showMutePanel, setShowMutePanel] = useState(false);
  const [showCustomMuteInputs, setShowCustomMuteInputs] = useState(false);
  const [isAddMembersModalOpen, setIsAddMembersModalOpen] = useState(false);
  const [muteStartTime, setMuteStartTime] = useState("22:00");
  const [muteEndTime, setMuteEndTime] = useState("07:00");
  const [muteSummary, setMuteSummary] = useState<string | null>(null);
  const [showTransferOwnerModal, setShowTransferOwnerModal] = useState(false);
  const [isTransferringOwnership, setIsTransferringOwnership] = useState(false);
  const [selectedNewOwnerEmail, setSelectedNewOwnerEmail] = useState<
    string | null
  >(null);
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [isSavingGroupName, setIsSavingGroupName] = useState(false);

  useEffect(() => {
    if (activeChat?.id) {
      // Pre-fetch first few assets for the preview
      fetchArchiveAssets(activeChat.id, "media", true);
      fetchArchiveAssets(activeChat.id, "file", true);
      fetchArchiveAssets(activeChat.id, "link", true);
    }
  }, [activeChat?.id]);

  useEffect(() => {
    if (!activeChat) return;
    const schedule = getConversationMuteSchedule(activeChat.id);
    if (schedule) {
      setMuteStartTime(schedule.startTime);
      setMuteEndTime(schedule.endTime);
      setMuteSummary(formatMuteScheduleLabel(schedule));
    } else {
      setMuteSummary(null);
    }
    setShowMutePanel(false);
    setShowCustomMuteInputs(false);
    setIsEditingGroupName(false);
    setNewGroupName(activeChat.name || "");
  }, [activeChat]);

  const normalizedUserEmail = String(user?.email || "")
    .trim()
    .toLowerCase();
  const isGroupOwner =
    activeChat?.type === "group" &&
    ((activeChat.owner || activeChat.admin || "").trim().toLowerCase() ===
      normalizedUserEmail ||
      (activeChat.admin || "").trim().toLowerCase() === normalizedUserEmail);
  const groupMembers = Array.isArray(activeChat?.members)
    ? activeChat.members.filter(Boolean)
    : [];
  const transferOwnerCandidates = groupMembers.filter(
    (memberEmail) =>
      String(memberEmail || "")
        .trim()
        .toLowerCase() !== normalizedUserEmail,
  );

  const isDeputy =
    activeChat?.type === "group" &&
    Array.isArray(activeChat.deputies) &&
    activeChat.deputies.some(
      (d) => String(d).trim().toLowerCase() === normalizedUserEmail,
    );

  const canManageGroup = isGroupOwner || isDeputy;

  const pinnedIds = (activeChat as any)?.pinnedMessageIds || [];
  const pinnedMessages = useMemo(() => {
    if (!activeConvId || pinnedIds.length === 0) return [];
    return pinnedIds.map((id: string) => {
      const msg = messages.find(
        (m) => m.id === id && m.conversationId === activeConvId,
      );
      return msg
        ? { id: msg.id, content: msg.content, createdAt: msg.createdAt }
        : { id, content: "Đang tải...", isPlaceholder: true };
    });
  }, [pinnedIds, messages, activeConvId]);

  // Instant Previews Logic
  const mediaPreview = useMemo(() => {
    const local = messages.flatMap(m => [...(m.media || []), ...(m.files || [])].map(a => ({ ...normalizeAttachment(a), msgId: m.id, createdAt: m.createdAt })));
    const remote = archiveAssets.media.items.flatMap(m => [...(m.media || []), ...(m.files || [])].map(a => ({ ...normalizeAttachment(a), msgId: m.id, createdAt: m.createdAt })));
    const combined = [...local, ...remote];
    const unique = Array.from(new Map(combined.map(a => [`${a.msgId}-${a.dataUrl}`, a])).values());
    return (unique as any[])
      .filter(a => a.mimeType?.startsWith("image/") || a.mimeType?.startsWith("video/"))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4);
  }, [messages, archiveAssets.media.items]);

  const filePreview = useMemo(() => {
    const filterFn = (a: any) => {
      const name = a.name?.toLowerCase() || "";
      const mime = a.mimeType?.toLowerCase() || "";
      return (
        !name.includes("location.json") &&
        !name.includes("contact.json") &&
        !mime.startsWith("audio/")
      );
    };

    const local = messages.flatMap((m) =>
      (m.files || [])
        .map((a) => ({
          ...normalizeAttachment(a),
          msgId: m.id,
          createdAt: m.createdAt,
        }))
        .filter(filterFn),
    );
    const remote = archiveAssets.file.items.flatMap((m) =>
      (m.files || [])
        .map((a) => ({
          ...normalizeAttachment(a),
          msgId: m.id,
          createdAt: m.createdAt,
        }))
        .filter(filterFn),
    );
    const combined = [...local, ...remote];
    const unique = Array.from(
      new Map(combined.map((a) => [`${a.msgId}-${a.name}`, a])).values(),
    );
    return (unique as any[])
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 3);
  }, [messages, archiveAssets.file.items]);

  const linkPreview = useMemo(() => {
    const extractLinks = (m: any) => {
      const urls = m.content?.match(/https?:\/\/[^\s]+/g) || [];
      return urls.map((url: string) => ({ url, msgId: m.id, createdAt: m.createdAt }));
    };
    const local = messages.flatMap(extractLinks);
    const remote = archiveAssets.link.items.flatMap(extractLinks);
    const combined = [...local, ...remote];
    const unique = Array.from(new Map(combined.map(a => [`${a.msgId}-${a.url}`, a])).values());
    return (unique as any[])
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  }, [messages, archiveAssets.link.items]);

  useEffect(() => {
    if (!showTransferOwnerModal) return;
    if (!transferOwnerCandidates.length) {
      setSelectedNewOwnerEmail(null);
      return;
    }

    const selectedStillValid = selectedNewOwnerEmail
      ? transferOwnerCandidates.includes(selectedNewOwnerEmail)
      : false;

    if (!selectedStillValid) {
      setSelectedNewOwnerEmail(transferOwnerCandidates[0]);
    }
  }, [showTransferOwnerModal, transferOwnerCandidates, selectedNewOwnerEmail]);

  if (!activeChat) return null;

  const partnerEmail =
    activeChat.type === "direct"
      ? Array.isArray(activeChat.members)
        ? activeChat.members.find((m) => {
            const normalizedM = String(m || "")
              .trim()
              .toLowerCase();
            const normalizedMe = String(user?.email || "")
              .trim()
              .toLowerCase();
            return normalizedM !== normalizedMe;
          })
        : undefined
      : undefined;

  const isBot = partnerEmail?.toLowerCase() === 'bot@zaloedu.system';

  const chatName =
    activeChat.type === "direct"
      ? getDisplayName(partnerEmail, user, userProfiles)
      : activeChat.name || "Group";

  const chatAvatar =
    activeChat.type === "direct"
      ? getDisplayAvatar(partnerEmail, user, userProfiles)
      : activeChat.avatar || "/logo_blue.png";

  const currentAutoDeleteDays = activeChat.autoDeleteDays ?? null;
  const muted = !!(activeConvId && isConversationMuted(activeConvId));
  const muteSetting = activeConvId
    ? mutedConversations[activeConvId]
    : undefined;

  const getMuteStatusLabel = () => {
    if (!activeConvId || !muted) return "ĐANG BẬT";
    if (muteSetting === "until-open") return "ĐẾN KHI MỞ LẠI";
    if (muteSetting === true) return "VĨNH VIỄN";
    if (typeof muteSetting === "number") {
      const diff = muteSetting - Date.now();
      if (diff <= 0) return "ĐANG BẬT";
      const hours = Math.floor(diff / (60 * 60 * 1000));
      const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
      if (hours > 0) return `${hours}G ${minutes}P`;
      return `${Math.max(1, minutes)} PHÚT`;
    }
    return "ĐANG TẮT";
  };

  const autoDeleteLabel = (days: 1 | 7 | 30 | null) => {
    if (days === 1) return "1 ngày";
    if (days === 7) return "7 ngày";
    if (days === 30) return "30 ngày";
    return "Không bao giờ";
  };

  const openAutoDeleteModal = () => {
    setPendingAutoDeleteDays(currentAutoDeleteDays as 1 | 7 | 30 | null);
    setShowAutoDeleteModal(true);
  };

  const confirmAutoDelete = async () => {
    if (!activeConvId) return;
    setSavingAutoDelete(true);
    try {
      await setConversationAutoDelete(activeConvId, pendingAutoDeleteDays);
      setShowAutoDeleteModal(false);
    } catch {
      // Errors are logged in store; modal stays open for retry.
    } finally {
      setSavingAutoDelete(false);
    }
  };

  const applyMuteSchedule = (schedule: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  }) => {
    if (!activeChat) return;

    setConversationMuteSchedule(
      activeChat.id,
      schedule as ConversationMuteSchedule,
    );
    setMuteSummary(
      formatMuteScheduleLabel(schedule as ConversationMuteSchedule),
    );
    setShowMutePanel(false);
    setShowCustomMuteInputs(false);

    // Also trigger store-level mute (manual) to be safe or just rely on scheduler
    // For now, let's keep schedule as a separate UI/UX enhancement
  };

  const handleSaveMuteSchedule = () => {
    applyMuteSchedule({
      enabled: true,
      startTime: muteStartTime,
      endTime: muteEndTime,
    });
  };

  const handleClearMuteSchedule = () => {
    if (!activeChat) return;

    clearConversationMuteSchedule(activeChat.id);
    setMuteSummary(null);
    setShowMutePanel(false);
    setShowCustomMuteInputs(false);
  };

  const uniqueSenders = activeChat?.members || [];

  const handleOpenProfile = () => {
    if (!partnerEmail) return;
    navigate(`/profile?email=${encodeURIComponent(partnerEmail)}`);
  };

  const handleToggleMute = async () => {
    if (!activeConvId) return;

    if (muted) {
      clearConversationMuted(activeConvId);
      await Swal.fire({
        icon: "success",
        title: "Đã bật lại thông báo",
        timer: 1300,
        showConfirmButton: false,
      });
      return;
    }

    const choice = await Swal.fire({
      title: "Xác nhận",
      html: `
        <div style="text-align:left; margin-top:8px; font-size:18px; color:#1f2a44;">
          Bạn có chắc muốn tắt thông báo hội thoại này:
        </div>
        <div style="margin-top:12px; display:flex; flex-direction:column; gap:12px; text-align:left; font-size:16px;">
          <label><input type="radio" name="mute-option" value="1h" checked /> Trong 1 giờ</label>
          <label><input type="radio" name="mute-option" value="4h" /> Trong 4 giờ</label>
          <label><input type="radio" name="mute-option" value="until-8am" /> Cho đến 8:00 AM</label>
          <label><input type="radio" name="mute-option" value="until-open" /> Cho đến khi được mở lại</label>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Đồng ý",
      cancelButtonText: "Hủy",
      focusConfirm: false,
      preConfirm: () => {
        const selected = document.querySelector(
          'input[name="mute-option"]:checked',
        ) as HTMLInputElement | null;
        return selected?.value || "1h";
      },
    });

    if (!choice.isConfirmed || !choice.value) return;

    muteConversationFor(
      activeConvId,
      choice.value as "1h" | "4h" | "until-8am" | "until-open",
    );
    await Swal.fire({
      icon: "success",
      title: "Đã tắt thông báo",
      timer: 1300,
      showConfirmButton: false,
    });
  };

  const handleClearConversationOneSide = async () => {
    if (!activeConvId) return;

    const confirm = await Swal.fire({
      icon: "warning",
      title: "Xóa cuộc trò chuyện phía bạn?",
      text: "Tin nhắn sẽ bị xóa ở tài khoản của bạn, phía đối phương vẫn giữ nguyên.",
      showCancelButton: true,
      confirmButtonText: "Xóa",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#d93025",
    });

    if (!confirm.isConfirmed) return;

    try {
      await clearHistory(activeConvId);
      await Swal.fire({
        icon: "success",
        title: "Đã xóa cuộc trò chuyện",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch {
      await Swal.fire({
        icon: "error",
        title: "Không thể xóa cuộc trò chuyện",
        text: "Vui lòng thử lại sau.",
      });
    }
  };

  const handleLeaveGroup = async () => {
    if (!activeConvId || !user?.email) return;
    if (isGroupOwner) {
      setSelectedNewOwnerEmail(transferOwnerCandidates[0] || null);
      setShowTransferOwnerModal(true);
      return;
    }

    try {
      await removeMember(activeConvId, user.email);
      navigate("/chat");
    } catch (err: any) {
      Swal.fire(
        "Lỗi",
        err.response?.data?.message || "Không thể rời nhóm",
        "error",
      );
    }
  };

  const handleDissolveGroup = async () => {
    if (!activeConvId) return;
    const confirm = await Swal.fire({
      title: "Giải tán nhóm?",
      text: "Tất cả thành viên sẽ bị xóa khỏi nhóm và lịch sử chat sẽ bị xóa.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Giải tán",
      cancelButtonColor: "#d33",
    });
    if (confirm.isConfirmed) {
      try {
        await dissolveGroup(activeConvId);
      } catch (err: any) {
        Swal.fire(
          "Lỗi",
          err.response?.data?.message || "Không thể giải tán nhóm",
          "error",
        );
      }
    }
  };

  const handleKickMember = async (targetEmail: string) => {
    if (!activeConvId) return;
    const confirm = await Swal.fire({
      title: "Xóa thành viên?",
      text: `Bạn có chắc muốn xóa ${getDisplayName(targetEmail, user, userProfiles)} khỏi nhóm?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Xóa",
    });
    if (confirm.isConfirmed) {
      try {
        await removeMember(activeConvId, targetEmail);
      } catch (err: any) {
        Swal.fire(
          "Lỗi",
          err.response?.data?.message || "Không thể xóa thành viên",
          "error",
        );
      }
    }
  };

  const handleChangeRole = async (
    targetEmail: string,
    role: "member" | "deputy" | "owner",
  ) => {
    if (!activeConvId) return;
    try {
      await updateMemberRole(activeConvId, targetEmail, role);
    } catch (err: any) {
      Swal.fire(
        "Lỗi",
        err.response?.data?.message || "Không thể thay đổi vai trò",
        "error",
      );
    }
  };

  const handleTransferOwnershipAndLeave = async (targetEmail: string) => {
    if (!activeConvId || !user?.email || isTransferringOwnership) return;

    setIsTransferringOwnership(true);
    try {
      await updateMemberRole(activeConvId, targetEmail, "owner");
      await removeMember(activeConvId, user.email);
      setShowTransferOwnerModal(false);
      setSelectedNewOwnerEmail(null);
      navigate("/chat");
    } catch (err: any) {
      Swal.fire(
        "Lỗi",
        err.response?.data?.message || "Không thể chuyển quyền hoặc rời nhóm",
        "error",
      );
    } finally {
      setIsTransferringOwnership(false);
    }
  };


  const handleAddMembers = async () => {
    setIsAddMembersModalOpen(true);
  };

  const handleUpdateGroupName = async () => {
    if (!activeConvId || !newGroupName.trim() || isSavingGroupName) return;
    if (newGroupName === activeChat.name) {
      setIsEditingGroupName(false);
      return;
    }

    setIsSavingGroupName(true);
    try {
      await updateGroupInfo(activeConvId, { name: newGroupName.trim() });
      setIsEditingGroupName(false);
      Swal.fire({
        icon: "success",
        title: "Thành công",
        text: "Đã đổi tên nhóm",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err: any) {
      Swal.fire(
        "Lỗi",
        err.response?.data?.message || "Không thể cập nhật tên nhóm",
        "error",
      );
    } finally {
      setIsSavingGroupName(false);
    }
  };

  const handleUpdateGroupAvatar = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeConvId) return;

    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await api.post("/chat/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const avatarUrl = uploadRes.data.fileUrl || uploadRes.data.dataUrl || "";
      await updateGroupInfo(activeConvId, { avatar: avatarUrl });
      Swal.fire({
        icon: "success",
        title: "Thành công",
        text: "Đã cập nhật ảnh đại diện nhóm",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err: any) {
      Swal.fire(
        "Lỗi",
        err.response?.data?.message || "Không thể cập nhật ảnh đại diện",
        "error",
      );
    }
  };

  const DEFAULT_GROUP_AVATAR =
    "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";

  return (
    <div className="w-[320px] h-full border-l border-outline-variant/30 dark:border-outline-variant/30 bg-white dark:bg-surface-container flex flex-col shrink-0 animate-in slide-in-from-right-4 duration-300">
      <div className="p-6 border-b border-outline-variant/10 flex flex-col items-center">
        <div className="relative group mb-3">
          <img
            className={`w-20 h-20 rounded-full object-cover shadow-md border-2 border-white dark:border-surface-container-high ${partnerEmail ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
            src={
              activeChat.avatar ||
              (activeChat.type === "group" ? DEFAULT_GROUP_AVATAR : chatAvatar)
            }
            alt=""
            onClick={
              (activeChat.type === "group" || isBot) ? undefined : handleOpenProfile
            }
            title={
              (partnerEmail && !isBot)
                ? "Xem trang cá nhân"
                : activeChat.type === "group"
                  ? "Đổi ảnh đại diện"
                  : undefined
            }
          />
          {activeChat.type === "group" && (
            <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <Camera size={24} className="text-white" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpdateGroupAvatar}
              />
            </label>
          )}
        </div>
        {isEditingGroupName ? (
          <div className="w-full flex items-center gap-2 px-2 mt-1">
            <input
              autoFocus
              className="flex-1 bg-surface-container-highest px-3 py-2 rounded-xl text-[14px] font-bold text-on-surface outline-none border-2 border-primary"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUpdateGroupName();
                if (e.key === "Escape") setIsEditingGroupName(false);
              }}
            />
            <button
              onClick={handleUpdateGroupName}
              disabled={isSavingGroupName}
              className="p-2 bg-primary text-white rounded-xl hover:opacity-90 disabled:opacity-50"
            >
              {isSavingGroupName ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 max-w-full">
            <h3 className="font-bold text-[16px] text-on-surface text-center leading-tight truncate">
              {chatName}
            </h3>
            {activeChat.type === "group" && canManageGroup && (
              <button
                onClick={() => setIsEditingGroupName(true)}
                className="p-1.5 rounded-full hover:bg-surface-container-highest text-on-surface-variant transition-colors"
              >
                <Settings size={14} />
              </button>
            )}
          </div>
        )}
        <p className="text-[12px] text-on-surface-variant font-medium mt-1">
          {activeChat.type === "direct"
            ? isBot ? "Trợ lý AI" : "Trò chuyện cá nhân"
            : "Hội thoại nhóm"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="py-2">
          {/* Section: Kho lưu trữ Tabs & Filters */}
            {viewMode === "info" ? (
              <div className="px-4 space-y-6 py-4">
                {/* Media Preview */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[13px] font-bold text-on-surface">Ảnh/Video</h4>
                    <button 
                      onClick={() => { setViewMode("archive"); setActiveStorageTab("media"); }}
                      className="text-[12px] font-medium text-primary hover:underline"
                    >
                      Xem tất cả
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {mediaPreview.map((att, i) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden bg-surface-container-highest border border-outline-variant/10">
                         <img src={att.dataUrl} className="w-full h-full object-cover" alt="" />
                      </div>
                    ))}
                    {mediaPreview.length === 0 && !archiveAssets.media.loading && (
                      <p className="text-[12px] italic opacity-50 col-span-4 py-2">Chưa có ảnh/video</p>
                    )}
                    {archiveAssets.media.loading && mediaPreview.length === 0 && (
                      <div className="col-span-4 py-2 flex justify-center"><Loader2 size={16} className="animate-spin text-primary/40" /></div>
                    )}
                  </div>
                </div>

                {/* Files Preview */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[13px] font-bold text-on-surface">File</h4>
                    <button 
                      onClick={() => { setViewMode("archive"); setActiveStorageTab("file"); }}
                      className="text-[12px] font-medium text-primary hover:underline"
                    >
                      Xem tất cả
                    </button>
                  </div>
                  <div className="space-y-2">
                    {filePreview.map((file, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 bg-surface-container-highest/30 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText size={16} className="text-primary" />
                        </div>
                        <span className="text-[12px] truncate flex-1 font-medium">{file.name}</span>
                      </div>
                    ))}
                    {filePreview.length === 0 && !archiveAssets.file.loading && (
                      <p className="text-[12px] italic opacity-50 py-2">Chưa có file</p>
                    )}
                    {archiveAssets.file.loading && filePreview.length === 0 && (
                      <div className="py-2 flex justify-center"><Loader2 size={16} className="animate-spin text-primary/40" /></div>
                    )}
                  </div>
                </div>

                {/* Links Preview */}
                <div className="space-y-3 pb-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[13px] font-bold text-on-surface">Link</h4>
                    <button 
                      onClick={() => { setViewMode("archive"); setActiveStorageTab("link"); }}
                      className="text-[12px] font-medium text-primary hover:underline"
                    >
                      Xem tất cả
                    </button>
                  </div>
                  <div className="space-y-2">
                    {linkPreview.map((x: any, i) => (
                      <a key={i} href={x.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-2 bg-surface-container-highest/30 rounded-xl hover:bg-surface-container-highest transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                          <Link size={14} className="text-secondary" />
                        </div>
                        <span className="text-[11px] truncate flex-1 text-primary hover:underline">{x.url}</span>
                      </a>
                    ))}
                    {linkPreview.length === 0 && !archiveAssets.link.loading && (
                      <p className="text-[12px] italic opacity-50 py-2">Chưa có link</p>
                    )}
                    {archiveAssets.link.loading && linkPreview.length === 0 && (
                      <div className="py-2 flex justify-center"><Loader2 size={16} className="animate-spin text-primary/40" /></div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-outline-variant/10 bg-surface-container-lowest sticky top-0 z-10">
                  <button 
                    onClick={() => setViewMode("info")}
                    className="p-2 hover:bg-surface-container rounded-full"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-[14px] font-bold">Kho lưu trữ</span>
                </div>

                <div className="flex px-4 pt-2 mb-3 border-b border-outline-variant/10">
                  <button
                    className={`flex-1 pb-2 text-[13px] font-semibold border-b-2 transition-colors ${activeStorageTab === "media" ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}
                    onClick={() => setActiveStorageTab("media")}
                  >
                    Ảnh/Video
                  </button>
                  <button
                    className={`flex-1 pb-2 text-[13px] font-semibold border-b-2 transition-colors ${activeStorageTab === "file" ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}
                    onClick={() => setActiveStorageTab("file")}
                  >
                    Files
                  </button>
                  <button
                    className={`flex-1 pb-2 text-[13px] font-semibold border-b-2 transition-colors ${activeStorageTab === "link" ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}
                    onClick={() => setActiveStorageTab("link")}
                  >
                    Links
                  </button>
                </div>

                <div className="flex gap-2 px-4 mb-4">
                  <select
                    value={senderFilter}
                    onChange={(e) => setSenderFilter(e.target.value)}
                    className="flex-1 bg-surface-container-highest px-3 py-2 rounded-xl text-[12px] text-on-surface outline-none border border-transparent focus:border-primary/30 appearance-none cursor-pointer"
                  >
                    <option value="all">Người gửi</option>
                    {uniqueSenders.map((email) => (
                      <option key={email} value={email}>
                        {getDisplayName(email, user, userProfiles)}
                      </option>
                    ))}
                  </select>

                  <input
                    type="date"
                    value={
                      dateFilter === "all" ||
                      dateFilter === "newest" ||
                      dateFilter === "oldest"
                        ? ""
                        : dateFilter
                    }
                    onChange={(e) => setDateFilter(e.target.value || "all")}
                    className="flex-1 bg-surface-container-highest px-3 py-2 rounded-xl text-[12px] text-on-surface outline-none border border-transparent focus:border-primary/30 cursor-pointer"
                    title="Chọn ngày"
                  />
                </div>

                <div className="py-2">
                  {activeChat && (
                    <>
                      {activeStorageTab === "media" && <AssetMediaGrid convId={activeChat.id} />}
                      {activeStorageTab === "file" && <AssetFileList convId={activeChat.id} />}
                      {activeStorageTab === "link" && <AssetLinkList convId={activeChat.id} />}
                    </>
                  )}
                </div>
              </div>
            )}

          {/* Section: Pinned Messages */}
          {activeChat.type === "group" && !isBot && pinnedIds.length > 0 && (
            <div className="mt-4 px-4">
              <div className="flex items-center justify-between mb-2 px-1">
                <h4 className="text-[11px] font-extrabold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                  <Pin size={12} className="text-primary fill-primary/10" />
                  Tin nhắn đã ghim ({pinnedIds.length})
                </h4>
              </div>
              <div className="space-y-2">
                {pinnedMessages.map((msg: any) => (
                  <div
                    key={msg.id}
                    onClick={() => {
                      const { jumpToMessage } = useChatStore.getState();
                      jumpToMessage(msg.id);
                    }}
                    className="group/pin flex items-start gap-3 p-2.5 bg-amber-50/50 dark:bg-primary/5 rounded-xl border border-amber-200/30 dark:border-primary/10 hover:border-primary/30 transition-all cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-on-surface font-medium line-clamp-2 leading-snug">
                        {msg.content}
                      </p>
                      <p className="text-[9px] text-on-surface-variant/70 font-bold uppercase mt-1">
                        {msg.createdAt
                          ? new Date(msg.createdAt).toLocaleDateString("vi-VN")
                          : "Ghim gần đây"}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const { patchMessageOptimistic } =
                          useChatStore.getState();
                        if (activeConvId) {
                          patchMessageOptimistic(activeConvId, msg.id, {
                            action: "unpin",
                          });
                        }
                      }}
                      className="opacity-0 group-hover/pin:opacity-100 p-1.5 hover:bg-error/10 text-error rounded-lg transition-all"
                      title="Bỏ ghim"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Settings */}
          <div className="mt-4 px-4 space-y-1">
            <button
              onClick={openAutoDeleteModal}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-surface-container text-on-surface font-semibold text-[13px] transition-all"
            >
              <span className="flex items-center gap-3">
                <Clock3 size={20} className="text-on-surface-variant" />
                Tin nhắn tự xóa
              </span>
              <span className="text-[12px] font-bold text-primary">
                {autoDeleteLabel(currentAutoDeleteDays as 1 | 7 | 30 | null)}
              </span>
            </button>

            {/* Mute Setting (HEAD Quick Toggle) */}
            <button
              onClick={handleToggleMute}
              className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-surface-container text-on-surface font-semibold text-[13px] transition-all ${muted ? "bg-surface-container/70" : ""}`}
            >
              <span className="flex items-center gap-3">
                <BellOff
                  size={20}
                  className={muted ? "text-primary" : "text-on-surface-variant"}
                />
                {muted ? "Bật lại thông báo" : "Tắt thông báo"}
              </span>
              <span
                className={`text-[11px] font-bold ${muted ? "text-primary" : "text-on-surface-variant/70"}`}
              >
                {!isBot && getMuteStatusLabel()}
              </span>
            </button>

            {!isBot && (
              <button
                onClick={() => setShowMutePanel((prev) => !prev)}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-surface-container text-on-surface font-semibold text-[13px] transition-all"
              >
                <span className="flex items-center gap-3">
                  <Bell size={20} className="text-on-surface-variant" />
                  Khung giờ tắt thông báo
                </span>
                <div className="flex items-center gap-1">
                  {muteSummary && (
                    <span className="text-[11px] font-medium text-primary">
                      {muteSummary}
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    className={`text-on-surface-variant transition-transform ${showMutePanel ? "rotate-180" : ""}`}
                  />
                </div>
              </button>
            )}

            {showMutePanel && (
              <div className="mx-2 my-2 rounded-2xl border border-outline-variant/20 bg-surface-container/90 p-3 space-y-3 shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-on-surface">
                    <Bell size={16} className="text-primary" />
                    Thiết lập khung giờ
                  </div>
                  <button
                    onClick={handleClearMuteSchedule}
                    className="inline-flex items-center justify-center gap-1 rounded-full border border-outline-variant/20 px-2.5 py-1 text-[11px] font-semibold text-on-surface"
                  >
                    <X size={14} />
                    Xóa
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      applyMuteSchedule(
                        createConversationMuteScheduleFromDuration(1),
                      )
                    }
                    className="rounded-xl border border-outline-variant/20 bg-white dark:bg-surface-container-high px-2 py-2 text-[12px] font-semibold text-on-surface hover:border-primary/40 hover:bg-primary/5"
                  >
                    1 tiếng
                  </button>
                  <button
                    onClick={() =>
                      applyMuteSchedule(
                        createConversationMuteScheduleFromDuration(4),
                      )
                    }
                    className="rounded-xl border border-outline-variant/20 bg-white dark:bg-surface-container-high px-2 py-2 text-[12px] font-semibold text-on-surface hover:border-primary/40 hover:bg-primary/5"
                  >
                    4 tiếng
                  </button>
                  <button
                    onClick={() =>
                      applyMuteSchedule(
                        createConversationMuteScheduleFromDuration(8),
                      )
                    }
                    className="rounded-xl border border-outline-variant/20 bg-white dark:bg-surface-container-high px-2 py-2 text-[12px] font-semibold text-on-surface hover:border-primary/40 hover:bg-primary/5"
                  >
                    8 tiếng
                  </button>
                  <button
                    onClick={() =>
                      applyMuteSchedule(
                        createConversationMuteScheduleUntilMorning(8),
                      )
                    }
                    className="rounded-xl border border-outline-variant/20 bg-white dark:bg-surface-container-high px-2 py-2 text-[12px] font-semibold text-on-surface hover:border-primary/40 hover:bg-primary/5"
                  >
                    Đến 8:00 AM
                  </button>
                </div>

                <button
                  onClick={() => setShowCustomMuteInputs((prev) => !prev)}
                  className="w-full rounded-xl bg-primary/10 px-3 py-2 text-[12px] font-semibold text-primary"
                >
                  {showCustomMuteInputs
                    ? "Ẩn khung giờ tuỳ chỉnh"
                    : "Chọn khung giờ tuỳ chỉnh"}
                </button>

                {showCustomMuteInputs && (
                  <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-white dark:bg-surface-container-high p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="block text-[10px] text-on-surface-variant">
                          Từ
                        </span>
                        <input
                          type="time"
                          value={muteStartTime}
                          onChange={(event) =>
                            setMuteStartTime(event.target.value)
                          }
                          className="w-full rounded-xl border border-outline-variant/20 bg-white dark:bg-surface-container px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[10px] text-on-surface-variant">
                          Đến
                        </span>
                        <input
                          type="time"
                          value={muteEndTime}
                          onChange={(event) =>
                            setMuteEndTime(event.target.value)
                          }
                          className="w-full rounded-xl border border-outline-variant/20 bg-white dark:bg-surface-container px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                        />
                      </label>
                    </div>
                    <button
                      onClick={handleSaveMuteSchedule}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-white"
                    >
                      <Check size={16} />
                      Lưu khung giờ
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleClearConversationOneSide}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-error dark:text-[#eef3fb] font-bold text-[13px] transition-all"
            >
              <Trash2 size={20} />
              Xóa lịch sử trò chuyện
            </button>

            {activeChat.type === "group" && !isBot && (
              <>
                <div className="pt-4 pb-2">
                  <h4 className="px-3 text-[11px] font-extrabold text-on-surface-variant uppercase tracking-wider">
                    Quản lý nhóm
                  </h4>
                </div>

                <button
                  onClick={handleLeaveGroup}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-error/10 text-error font-bold text-[13px] transition-all"
                >
                  <LogOut size={20} />
                  Rời nhóm
                </button>

                {(activeChat.owner === user?.email ||
                  activeChat.admin === user?.email) && (
                  <button
                    onClick={handleDissolveGroup}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-error/10 text-error font-extrabold text-[13px] transition-all"
                  >
                    <Trash2 size={20} />
                    Giải tán nhóm
                  </button>
                )}

                <div className="pt-6 pb-2 flex items-center justify-between px-3">
                  <h4 className="text-[11px] font-extrabold text-on-surface-variant uppercase tracking-wider">
                    Thành viên ({activeChat.members?.length || 0})
                  </h4>
                  <button
                    onClick={handleAddMembers}
                    className="p-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <div className="space-y-1 mt-1">
                  {activeChat.members?.map((memberEmail) => {
                    const isMe = memberEmail === user?.email;
                    const isOwner =
                      activeChat.owner === memberEmail ||
                      activeChat.admin === memberEmail;
                    const isDeputy = (activeChat.deputies || []).includes(
                      memberEmail,
                    );
                    const myRole = isGroupOwner
                      ? "owner"
                      : (activeChat.deputies || []).includes(user?.email || "")
                        ? "deputy"
                        : "member";

                    return (
                      <div
                        key={memberEmail}
                        onClick={() => {
                          if (memberEmail) {
                            navigate(`/profile?email=${encodeURIComponent(memberEmail)}`);
                          }
                        }}
                        className="group/member flex items-center gap-3 p-2 rounded-xl hover:bg-surface-container transition-all cursor-pointer"
                      >
                        <img
                          src={getDisplayAvatar(
                            memberEmail,
                            user,
                            userProfiles,
                          )}
                          className="w-9 h-9 rounded-full object-cover border border-outline-variant/10"
                          alt=""
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-on-surface truncate">
                            {getDisplayName(memberEmail, user, userProfiles)}
                            {isMe && (
                              <span className="ml-1 opacity-50 font-medium">
                                (Bạn)
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-1">
                            {isOwner && (
                              <span className="flex items-center gap-0.5 text-[10px] font-extrabold text-primary uppercase">
                                <ShieldCheck size={10} /> Trưởng nhóm
                              </span>
                            )}
                            {isDeputy && (
                              <span className="flex items-center gap-0.5 text-[10px] font-extrabold text-secondary uppercase">
                                <ShieldAlert size={10} /> CO_ADMIN
                              </span>
                            )}
                          </div>
                        </div>

                        {!isMe && (
                          <div className="flex items-center opacity-0 group-hover/member:opacity-100 transition-opacity">
                            {myRole === "owner" && (
                              <div className="flex items-center gap-1">
                                {!isOwner && !isDeputy && (
                                  <button
                                    onClick={() =>
                                      handleChangeRole(memberEmail, "deputy")
                                    }
                                    title="Chỉ định làm CO_ADMIN"
                                    className="p-1.5 rounded-lg hover:bg-surface-container-highest text-on-surface-variant hover:text-primary"
                                  >
                                    <ShieldCheck size={16} />
                                  </button>
                                )}
                                {isDeputy && (
                                  <button
                                    onClick={() =>
                                      handleChangeRole(memberEmail, "member")
                                    }
                                    title="Gỡ vai trò CO_ADMIN"
                                    className="p-1.5 rounded-lg hover:bg-surface-container-highest text-on-surface-variant hover:text-error"
                                  >
                                    <ShieldAlert size={16} />
                                  </button>
                                )}
                                {!isOwner && (
                                  <button
                                    onClick={() =>
                                      handleChangeRole(memberEmail, "owner")
                                    }
                                    title="Chuyển quyền trưởng nhóm"
                                    className="p-1.5 rounded-lg hover:bg-surface-container-highest text-on-surface-variant hover:text-amber-500"
                                  >
                                    <Settings size={16} />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleKickMember(memberEmail)}
                                  title="Xóa khỏi nhóm"
                                  className="p-1.5 rounded-lg hover:bg-error/10 text-error"
                                >
                                  <UserMinus size={16} />
                                </button>
                              </div>
                            )}
                            {myRole === "deputy" && !isOwner && !isDeputy && (
                              <button
                                onClick={() => handleKickMember(memberEmail)}
                                title="Xóa khỏi nhóm"
                                className="p-1.5 rounded-lg hover:bg-error/10 text-error"
                              >
                                <UserMinus size={16} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showTransferOwnerModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35">
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default"
            aria-label="Đóng chuyển quyền trưởng nhóm"
            onClick={() => {
              if (!isTransferringOwnership) {
                setShowTransferOwnerModal(false);
              }
            }}
          />
          <div className="relative z-10 w-full max-w-140 rounded-t-[28px] bg-white dark:bg-surface-container shadow-[0_-16px_40px_rgba(0,0,0,0.18)] border border-outline-variant/10 px-5 pb-6 pt-3">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-outline-variant/30" />
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-[18px] font-extrabold text-on-surface">
                  Bầu trưởng nhóm mới
                </h3>
                <p className="mt-1 text-[12px] text-on-surface-variant">
                  Chọn một thành viên để chuyển quyền ngay rồi rời nhóm.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isTransferringOwnership) {
                    setShowTransferOwnerModal(false);
                  }
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant"
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
              {transferOwnerCandidates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-outline-variant/20 bg-surface-container-low px-4 py-8 text-center">
                  <p className="text-[13px] font-medium text-on-surface-variant">
                    Không có thành viên nào khác để chuyển quyền.
                  </p>
                </div>
              ) : (
                transferOwnerCandidates.map((memberEmail) => {
                  const isDeputy = (activeChat.deputies || []).includes(
                    memberEmail,
                  );
                  const isSelected = selectedNewOwnerEmail === memberEmail;
                  return (
                    <button
                      key={memberEmail}
                      type="button"
                      disabled={isTransferringOwnership}
                      onClick={() => setSelectedNewOwnerEmail(memberEmail)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-outline-variant/10 bg-surface-container-lowest hover:bg-primary/5"
                      }`}
                    >
                      <img
                        src={getDisplayAvatar(memberEmail, user, userProfiles)}
                        className="h-11 w-11 rounded-full object-cover border border-outline-variant/10"
                        alt=""
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold text-on-surface">
                          {getDisplayName(memberEmail, user, userProfiles)}
                        </p>
                        <p className="text-[12px] text-on-surface-variant">
                          {isDeputy ? "CO_ADMIN" : "Thành viên"}
                        </p>
                      </div>
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                          isSelected
                            ? "border-primary bg-primary"
                            : "border-outline-variant/40"
                        }`}
                      >
                        {isSelected && (
                          <Check size={14} className="text-white" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-outline-variant/10 pt-4">
              <button
                type="button"
                disabled={isTransferringOwnership}
                onClick={() => setShowTransferOwnerModal(false)}
                className="rounded-xl bg-surface-container-high px-4 py-2 text-[13px] font-semibold text-on-surface disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={
                  isTransferringOwnership ||
                  !selectedNewOwnerEmail ||
                  transferOwnerCandidates.length === 0
                }
                onClick={() => {
                  if (selectedNewOwnerEmail) {
                    void handleTransferOwnershipAndLeave(selectedNewOwnerEmail);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isTransferringOwnership && (
                  <Loader2 size={16} className="animate-spin" />
                )}
                Bầu và rời nhóm
              </button>
            </div>
          </div>
        </div>
      )}

      {showAutoDeleteModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-115 rounded-2xl bg-white dark:bg-surface-container shadow-2xl border border-outline-variant/20 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
              <h3 className="text-[18px] font-extrabold text-on-surface">
                Cài đặt tin nhắn tự xóa
              </h3>
              <button
                onClick={() => setShowAutoDeleteModal(false)}
                type="button"
                className="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
              >
                <X size={22} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {[1, 7, 30].map((days) => (
                <label
                  key={days}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="radio"
                    checked={pendingAutoDeleteDays === days}
                    onChange={() =>
                      setPendingAutoDeleteDays(days as 1 | 7 | 30)
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-[18px] text-on-surface">
                    {days} ngày
                  </span>
                </label>
              ))}

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={pendingAutoDeleteDays === null}
                  onChange={() => setPendingAutoDeleteDays(null)}
                  className="w-4 h-4"
                />
                <span className="text-[18px] text-on-surface">
                  Không bao giờ
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-outline-variant/20 bg-surface-container/40">
              <button
                onClick={() => setShowAutoDeleteModal(false)}
                className="px-6 py-3 rounded-lg bg-surface-container-high text-on-surface font-bold hover:opacity-90"
                type="button"
              >
                Hủy
              </button>
              <button
                onClick={confirmAutoDelete}
                disabled={
                  savingAutoDelete ||
                  pendingAutoDeleteDays === currentAutoDeleteDays
                }
                className="px-6 py-3 rounded-lg bg-primary text-white font-bold disabled:opacity-50"
                type="button"
              >
                {savingAutoDelete ? "Đang lưu..." : "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AddMembersModal
        isOpen={isAddMembersModalOpen}
        onClose={() => setIsAddMembersModalOpen(false)}
        conversationId={activeConvId || ""}
        currentMembers={activeChat?.members || []}
      />
    </div>
  );
};

export default ChatInfoSidebar;
