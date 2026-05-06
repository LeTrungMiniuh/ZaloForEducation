import React, { useEffect, useRef } from "react";
import { useChatStore } from "../../store/chatStore";
import { Loader2, FileText, Download, ExternalLink } from "lucide-react";
import { formatFileSize, normalizeAttachment } from "../../utils/chatUtils";

interface AssetFileListProps {
  convId: string;
}

const AssetFileList: React.FC<AssetFileListProps> = ({ convId }) => {
  const { archiveAssets, fetchArchiveAssets, jumpToMessage } = useChatStore();
  const { items, cursor, loading } = archiveAssets.file;
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchArchiveAssets(convId, "file", true);
  }, [convId]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !loading) {
          fetchArchiveAssets(convId, "file");
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
        <p className="text-[13px] italic">Chưa có tệp tin nào</p>
      </div>
    );
  }

  return (
    <div className="px-4 space-y-2 pb-4">
      {items.map((msg) => {
        const files = (msg.files || [])
          .map(normalizeAttachment)
          .filter((f) => {
            const name = f.name?.toLowerCase() || "";
            const mime = f.mimeType?.toLowerCase() || "";
            return (
              !name.includes("location.json") &&
              !name.includes("contact.json") &&
              !mime.startsWith("audio/")
            );
          });
        return files.map((file, idx) => (
          <div 
            key={`${msg.id}-${idx}`}
            className="group flex items-center gap-3 p-2.5 bg-surface-container-highest/40 rounded-xl hover:bg-surface-container-highest transition-all border border-outline-variant/5"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
               <FileText className="w-5 h-5" />
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-on-surface truncate" title={file.name}>
                {file.name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-on-surface-variant font-medium">
                  {formatFileSize(file.size || 0)}
                </span>
                <span className="text-[10px] text-on-surface-variant opacity-50">•</span>
                <span className="text-[10px] text-on-surface-variant">
                  {new Date(msg.createdAt).toLocaleDateString("vi-VN")}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => jumpToMessage(msg.id)}
                className="p-1.5 hover:bg-primary/20 rounded-lg text-primary transition-colors"
                title="Xem tin nhắn gốc"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              <a
                href={file.dataUrl}
                download={file.name}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 hover:bg-primary/20 rounded-lg text-primary transition-colors"
                title="Tải về"
              >
                <Download className="w-4 h-4" />
              </a>
            </div>
          </div>
        ));
      })}

      <div ref={observerTarget} className="h-10 flex items-center justify-center">
        {loading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
      </div>
    </div>
  );
};

export default AssetFileList;
