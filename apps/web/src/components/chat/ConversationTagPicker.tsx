import React, { useMemo, useState } from "react";
import { useChatStore } from "../../store/chatStore";

const ConversationTagPicker: React.FC<{
  convId: string;
  onClose?: () => void;
}> = ({ convId, onClose }) => {
  const { tags, conversations, assignTagToConversation, addTag } =
    useChatStore();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#ffb020");

  const currentTagId = useMemo(() => {
    const conv: any = conversations.find((item) => item.id === convId);
    return conv?.tagId || null;
  }, [conversations, convId]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = `TAG#${Date.now()}`;
    await addTag({ id, name: trimmed, color });
    await assignTagToConversation(convId, id);
    setIsCreating(false);
    setName("");
    setColor("#ffb020");
    onClose?.();
  };

  return (
    <div className="min-w-56 rounded-2xl border border-outline-variant/20 bg-white p-2 shadow-lg dark:bg-surface-container-high">
      <div className="p-2 text-sm text-on-surface-variant">
        Phân loại cuộc trò chuyện
      </div>
      <div className="space-y-1 px-2 pb-2">
        <button
          onClick={async () => {
            await assignTagToConversation(convId, undefined);
            onClose?.();
          }}
          className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-[13px] ${!currentTagId ? "text-primary" : "text-on-surface"}`}
        >
          <span>Không có thẻ</span>
          {!currentTagId && (
            <span className="material-symbols-outlined">check</span>
          )}
        </button>

        {(tags || []).map((tag: any) => (
          <button
            key={tag.id}
            onClick={async () => {
              await assignTagToConversation(convId, tag.id);
              onClose?.();
            }}
            className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-[13px] ${currentTagId === tag.id ? "text-primary" : "text-on-surface"}`}
          >
            <div className="flex items-center gap-2">
              <span
                style={{ background: tag.color || "#ffb020" }}
                className="inline-block h-3 w-3 rounded-sm"
              />
              <span>{tag.name}</span>
            </div>
            {currentTagId === tag.id && (
              <span className="material-symbols-outlined">check</span>
            )}
          </button>
        ))}

        <div className="border-t pt-2 mt-2 space-y-2">
          {!isCreating ? (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full rounded px-3 py-2 text-left text-[13px] text-primary hover:bg-surface-container"
            >
              + Thêm thẻ mới
            </button>
          ) : (
            <div className="rounded-lg border border-outline-variant/20 p-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập tên thẻ"
                className="mb-2 w-full rounded border border-outline-variant/20 px-2 py-1.5 text-[13px]"
              />
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[12px] text-on-surface-variant">Màu</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-10 border-0 p-0"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!name.trim()}
                  className="rounded bg-primary px-3 py-1.5 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Tạo
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setName("");
                  }}
                  className="rounded border px-3 py-1.5 text-[12px]"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent("open-chat-tag-manager"))
            }
            className="w-full rounded px-3 py-2 text-left text-[13px] text-on-surface-variant hover:bg-surface-container"
          >
            Quản lý thẻ phân loại
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConversationTagPicker;
