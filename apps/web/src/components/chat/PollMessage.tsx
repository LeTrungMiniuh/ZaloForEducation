import React, { useMemo, useState } from "react";
import { Check, ListChecks, Lock, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

interface PollOption {
  text: string;
  votes: number;
  voters: string[];
}

interface PollMessageProps {
  messageId: string;
  topic: string;
  options: string[];
  votes?: Record<string, string>; // voterEmail -> optionIndex
  senderEmail?: string;
  onVote?: (optionIndex: number) => Promise<void>;
  onClosePoll?: () => Promise<void>;
  isClosed?: boolean;
  userProfiles?: Record<string, any>;
}

const PollMessage: React.FC<PollMessageProps> = ({
  messageId,
  topic,
  options,
  votes = {},
  senderEmail,
  onVote,
  onClosePoll,
  isClosed = false,
  userProfiles = {},
}) => {
  const { user } = useAuth();
  const [draftOption, setDraftOption] = useState<number | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showVotersModal, setShowVotersModal] = useState(false);

  const normalizedUserEmail = String(user?.email || "")
    .trim()
    .toLowerCase();

  const getDisplayName = (email: string) => {
    const norm = String(email).trim().toLowerCase();
    if (norm === normalizedUserEmail) return "Bạn";
    const profile = userProfiles[norm];
    return profile?.nickname || profile?.fullName || profile?.fullname || norm.split("@")[0];
  };

  const votedOptionByCurrentUser = useMemo(() => {
    const entries = Object.entries(votes || {});
    const found = entries.find(
      ([email]) =>
        String(email || "")
          .trim()
          .toLowerCase() === normalizedUserEmail,
    );
    if (!found) return null;
    const parsed = Number.parseInt(String(found[1]), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [votes, normalizedUserEmail]);

  const pollOptions = useMemo<PollOption[]>(() => {
    return options.map((text, idx) => {
      const votersForThis = Object.entries(votes || {})
        .filter(([_, optIdx]) => Number.parseInt(String(optIdx), 10) === idx)
        .map(([voterId]) => voterId);

      return {
        text,
        votes: votersForThis.length,
        voters: votersForThis,
      };
    });
  }, [options, votes]);

  const handleVote = async (optionIndex: number) => {
    if (isVoting || !onVote || isClosed) return;

    setIsVoting(true);
    try {
      await onVote(optionIndex);
      setDraftOption(null);
    } catch (error) {
      console.error("Failed to vote:", error);
    } finally {
      setIsVoting(false);
    }
  };

  const handleClosePoll = async () => {
    if (isClosing || !onClosePoll) return;
    setIsClosing(true);
    try {
      await onClosePoll();
    } catch (error) {
      console.error("Failed to close poll:", error);
    } finally {
      setIsClosing(false);
    }
  };

  const totalVotes = pollOptions.reduce((sum, opt) => sum + opt.votes, 0);
  const selectedOptionIndex = votedOptionByCurrentUser ?? draftOption;
  const canSubmit = draftOption !== null;
  const hasVoted = votedOptionByCurrentUser !== null;
  const isCreator =
    String(senderEmail || "")
      .trim()
      .toLowerCase() === normalizedUserEmail;

  return (
    <div className="w-full max-w-md space-y-3 rounded-2xl border border-[#d5d9e2] bg-white p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <ListChecks size={18} className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[12px] font-extrabold uppercase tracking-wider text-[#53627f]">
            Chọn một phương án
          </p>
          <p className="text-[14px] leading-tight font-extrabold text-[#1f2f4a] md:text-[15px]">
            {topic}
          </p>
        </div>
        {isClosed && (
          <div className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded-full text-[11px] font-bold shrink-0">
            <Lock size={12} />
            Đã đóng
          </div>
        )}
      </div>

      <div className="space-y-2">
        {pollOptions.map((option, index) => {
          const isSelected = selectedOptionIndex === index;
          const userVoted = option.voters.includes(user?.email || "");

          return (
            <button
              key={index}
              type="button"
              onClick={() => {
                if (isClosed || isVoting) return;
                setDraftOption(index);
              }}
              disabled={isVoting || isClosed}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-[#dde1ea] bg-[#f4f6fa] hover:border-primary/40"
              } ${isClosed || isVoting ? "cursor-default opacity-75" : "cursor-pointer"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                      isSelected
                        ? "bg-primary border-primary"
                        : "border-[#9ba6bb]"
                    }`}
                  >
                    {isSelected ? (
                      <Check size={13} className="text-white" />
                    ) : null}
                  </div>
                  <span className="truncate text-[14px] font-medium text-[#2b3445]">
                    {option.text}
                  </span>
                </div>

                <div className="ml-2 flex shrink-0 items-center gap-1.5">
                  <span className="text-[14px] font-medium leading-none text-[#31343a]">
                    {option.votes}
                  </span>
                  {userVoted && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                      Bạn
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-[#e4e8f0] pt-3">
        <div className="flex items-center justify-between text-[12px] text-[#5f6d84]">
          <button 
            type="button" 
            onClick={() => setShowVotersModal(true)}
            className="hover:text-primary hover:underline cursor-pointer transition-colors"
          >
            {totalVotes} phiếu • Xem chi tiết
          </button>
          {hasVoted && !isClosed ? (
            <p className="font-semibold text-primary">Đã bình chọn</p>
          ) : null}
        </div>

        {!isClosed && (
          <div className="flex gap-2">
            {hasVoted ? (
              <button
                type="button"
                onClick={() => {
                  if (
                    draftOption !== null &&
                    draftOption !== votedOptionByCurrentUser
                  ) {
                    void handleVote(draftOption);
                  }
                }}
                disabled={
                  !canSubmit ||
                  isVoting ||
                  draftOption === votedOptionByCurrentUser
                }
                className="flex-1 rounded-lg border border-primary bg-white px-4 py-2.5 text-[16px] font-bold text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isVoting ? "Đang gửi..." : "Đổi lựa chọn"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (draftOption !== null) {
                    void handleVote(draftOption);
                  }
                }}
                disabled={!canSubmit || isVoting}
                className="flex-1 rounded-lg border border-primary bg-white px-4 py-2.5 text-[16px] font-bold text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isVoting ? "Đang gửi..." : "Bình chọn"}
              </button>
            )}

            {isCreator && (
              <button
                type="button"
                onClick={() => void handleClosePoll()}
                disabled={isClosing}
                className="shrink-0 w-10 h-10 rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center"
                title="Đóng bình chọn"
              >
                {isClosing ? (
                  <span className="text-[10px]">...</span>
                ) : (
                  <X size={16} />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Voters Modal */}
      {showVotersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#f1f3f7] px-5 py-4">
              <h3 className="text-[17px] font-bold text-[#1f2f4a]">Chi tiết bình chọn</h3>
              <button
                onClick={() => setShowVotersModal(false)}
                className="rounded-full p-1.5 hover:bg-[#f1f3f7] text-[#53627f] transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="max-h-[70vh] overflow-y-auto p-5 space-y-5">
              {pollOptions.map((option, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[14px] font-bold text-[#1f2f4a]">{option.text}</p>
                    <span className="text-[13px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {option.votes}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {option.voters.length > 0 ? (
                      option.voters.map((email, vIdx) => (
                        <span 
                          key={vIdx} 
                          className="bg-[#f4f6fa] text-[#53627f] text-[12px] px-2.5 py-1 rounded-lg border border-[#dde1ea]"
                        >
                          {getDisplayName(email)}
                        </span>
                      ))
                    ) : (
                      <p className="text-[12px] italic text-[#9ba6bb]">Chưa có ai chọn</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="bg-[#f8f9fb] p-4 text-center">
              <p className="text-[12px] font-medium text-[#53627f]">Tổng cộng: {totalVotes} phiếu</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PollMessage;

