import React, { useEffect, useRef } from "react";
import { useChatStore } from "../../store/chatStore";
import { Loader2, Link as LinkIcon, ExternalLink, MessageSquare } from "lucide-react";

interface AssetLinkListProps {
  convId: string;
}

const AssetLinkList: React.FC<AssetLinkListProps> = ({ convId }) => {
  const { archiveAssets, fetchArchiveAssets, jumpToMessage } = useChatStore();
  const { items, cursor, loading } = archiveAssets.link;
  const observerTarget = useRef<HTMLDivElement>(null);

  const urlRegex = /https?:\/\/[^\s]+/g;

  useEffect(() => {
    fetchArchiveAssets(convId, "link", true);
  }, [convId]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !loading) {
          fetchArchiveAssets(convId, "link");
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
        <p className="text-[13px] italic">Chưa có liên kết nào</p>
      </div>
    );
  }

  return (
    <div className="px-4 space-y-2 pb-4">
      {items.map((msg) => {
        const content = String(msg.content || "");
        const urls = content.match(urlRegex) || [];
        
        return urls.map((url, idx) => (
          <div 
            key={`${msg.id}-${idx}`}
            className="group flex items-start gap-3 p-3 bg-surface-container-highest/40 rounded-xl hover:bg-surface-container-highest transition-all border border-outline-variant/5"
          >
            <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary shrink-0 mt-0.5">
               <LinkIcon className="w-5 h-5" />
            </div>
            
            <div className="flex-1 min-w-0">
              <a 
                href={url} 
                target="_blank" 
                rel="noreferrer" 
                className="text-[13px] font-medium text-primary hover:underline break-all line-clamp-2"
              >
                {url}
              </a>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-on-surface-variant font-medium">
                  {new Date(msg.createdAt).toLocaleDateString("vi-VN")}
                </span>
                <span className="text-[10px] text-on-surface-variant opacity-50">•</span>
                <button 
                  onClick={() => jumpToMessage(msg.id)}
                  className="text-[10px] text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
                >
                  <MessageSquare className="w-3 h-3" />
                  Xem tin nhắn
                </button>
              </div>
            </div>

            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 hover:bg-primary/20 rounded-lg text-primary transition-colors opacity-0 group-hover:opacity-100"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ));
      })}

      <div ref={observerTarget} className="h-10 flex items-center justify-center">
        {loading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
      </div>
    </div>
  );
};

export default AssetLinkList;
