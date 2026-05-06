import React, { useEffect, useRef } from "react";
import { useChatStore } from "../../store/chatStore";
import { Loader2, Play } from "lucide-react";
import { normalizeAttachment } from "../../utils/chatUtils";

interface AssetMediaGridProps {
  convId: string;
}

const AssetMediaGrid: React.FC<AssetMediaGridProps> = ({ convId }) => {
  const { archiveAssets, fetchArchiveAssets, setPreviewImage, jumpToMessage } = useChatStore();
  const { items, cursor, loading } = archiveAssets.media;
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchArchiveAssets(convId, "media", true);
  }, [convId]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !loading) {
          fetchArchiveAssets(convId, "media");
        }
      },
      { threshold: 1.0 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [convId, cursor, loading]);

  if (items.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 opacity-60">
        <p className="text-[13px] italic">Chưa có ảnh hoặc video nào</p>
      </div>
    );
  }

  return (
    <div className="px-4">
      <div className="grid grid-cols-3 gap-1">
        {items.map((msg) => {
          const attachments = [...(msg.media || []), ...(msg.files || [])]
            .map(normalizeAttachment)
            .filter((a) => 
              a.mimeType?.startsWith("image/") || a.mimeType?.startsWith("video/")
            );

          return attachments.map((att, idx) => {
            const isVideo = att.mimeType?.startsWith("video/");
            return (
              <div
                key={`${msg.id}-${idx}`}
                className="relative group aspect-square cursor-pointer overflow-hidden rounded-lg bg-surface-container-highest border border-outline-variant/10"
                onClick={() => {
                  if (!isVideo) {
                    setPreviewImage(att.dataUrl || "", att.name);
                  } else {
                    jumpToMessage(msg.id);
                  }
                }}
              >
                {isVideo ? (
                  <div className="w-full h-full relative">
                    <video
                      src={att.dataUrl}
                      className="w-full h-full object-cover"
                      preload="metadata"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                      <Play className="w-6 h-6 text-white fill-current" />
                    </div>
                  </div>
                ) : (
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                )}
                
                {/* Actions overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1.5">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      jumpToMessage(msg.id);
                    }}
                    className="text-[9px] text-white bg-primary/80 hover:bg-primary px-1.5 py-0.5 rounded-full text-center backdrop-blur-sm"
                  >
                    Xem tin nhắn gốc
                  </button>
                </div>
              </div>
            );
          });
        })}
      </div>

      {/* Infinite Scroll Anchor */}
      <div ref={observerTarget} className="h-10 flex items-center justify-center mt-2">
        {loading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
      </div>
    </div>
  );
};

export default AssetMediaGrid;
