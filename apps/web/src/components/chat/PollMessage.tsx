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
    <div className="w-full max-w-md space-y-5 rounded-[32px] border border-outline-variant/5 bg-white/80 dark:bg-surface-container-high/80 backdrop-blur-xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_48px_rgba(0,0,0,0.08)] transition-all duration-500 group">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-[20px] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 shadow-inner">
          <ListChecks size={24} className="text-primary" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/50">
              Bình chọn
            </span>
            {isClosed && (
              <span className="flex items-center gap-1 bg-error/10 text-error px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider">
                <Lock size={10} strokeWidth={3} /> Đã đóng
              </span>
            )}
          </div>
          <p className="text-[18px] leading-snug font-black text-on-surface tracking-tight">
            {topic}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {pollOptions.map((option, index) => {
          const isSelected = selectedOptionIndex === index;
          const userVoted = option.voters.includes(user?.email || "");
          const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;

          return (
            <button
              key={index}
              type="button"
              onClick={() => {
                if (isClosed || isVoting) return;
                setDraftOption(index);
              }}
              disabled={isVoting || isClosed}
              className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-all relative overflow-hidden group ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-outline-variant/10 bg-surface-container-low/30 hover:border-primary/30"
              } ${isClosed || isVoting ? "cursor-default opacity-85" : "cursor-pointer active:scale-[0.98]"}`}
            >
              {/* Progress Background */}
              <div 
                className={`absolute left-0 top-0 bottom-0 transition-all duration-1000 ease-out ${isSelected ? 'bg-primary/10' : 'bg-primary/5'}`}
                style={{ width: `${percentage}%` }}
              />

              <div className="flex items-center justify-between relative z-10">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                      isSelected
                        ? "bg-primary border-primary scale-110 shadow-lg shadow-primary/20"
                        : "border-outline-variant"
                    }`}
                  >
                    {isSelected ? (
                      <Check size={14} strokeWidth={4} className="text-white" />
                    ) : null}
                  </div>
                  <span className={`truncate text-[15px] font-bold ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                    {option.text}
                  </span>
                </div>

                <div className="ml-3 flex shrink-0 items-center gap-2">
                  <span className={`text-[15px] font-black ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}>
                    {option.votes}
                  </span>
                  {userVoted && (
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary uppercase tracking-wider">
                      Bạn
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between text-[12px]">
          <button 
            type="button" 
            onClick={() => setShowVotersModal(true)}
            className="text-on-surface-variant/60 hover:text-primary font-black uppercase tracking-widest transition-colors cursor-pointer"
          >
            {totalVotes} phiếu • Chi tiết
          </button>
          {hasVoted && !isClosed ? (
            <p className="font-black text-primary uppercase tracking-widest">Đã bình chọn</p>
          ) : null}
        </div>

        {!isClosed && (
          <div className="flex gap-3">
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
                className="flex-1 h-12 rounded-2xl bg-primary text-white text-[14px] font-black uppercase tracking-widest transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 shadow-lg shadow-primary/20"
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
                className="flex-1 h-12 rounded-2xl bg-primary text-white text-[14px] font-black uppercase tracking-widest transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 shadow-lg shadow-primary/20"
              >
                {isVoting ? "Đang gửi..." : "Bình chọn"}
              </button>
            )}

            {isCreator && (
              <button
                type="button"
                onClick={() => void handleClosePoll()}
                disabled={isClosing}
                className="shrink-0 w-12 h-12 rounded-2xl border border-error/20 bg-error/5 text-error transition-all hover:bg-error/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center"
                title="Đóng bình chọn"
              >
                {isClosing ? (
                  <span className="animate-pulse font-black">...</span>
                ) : (
                  <X size={20} strokeWidth={3} />
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

