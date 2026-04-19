import { Loader2, Search } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface StickerItem {
  id: string;
  name: string;
  url: string;
  source?: 'local' | 'tenor';
}

interface StickerPickerProps {
  onSelect: (sticker: StickerItem) => void;
}

type StickerLibrary = 'cute' | 'meme' | 'anime' | 'vn';

const TENOR_KEY = 'LIVDSRZULELA';

const LIBRARY_PRESET_QUERY: Record<StickerLibrary, string> = {
  cute: 'cute sticker',
  meme: 'meme sticker',
  anime: 'anime sticker',
  vn: 'viet nam sticker',
};

const LIBRARY_TABS: Array<{ id: StickerLibrary; label: string }> = [
  { id: 'cute', label: 'Cute' },
  { id: 'meme', label: 'Meme' },
  { id: 'anime', label: 'Anime' },
  { id: 'vn', label: 'VN' },
];

const StickerPicker: React.FC<StickerPickerProps> = ({ onSelect }) => {
  const [activeLibrary, setActiveLibrary] = useState<StickerLibrary>('cute');
  const [query, setQuery] = useState('');
  const [remoteStickers, setRemoteStickers] = useState<StickerItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchRemoteStickers = async () => {
      const effectiveQuery = query.trim() || LIBRARY_PRESET_QUERY[activeLibrary];

      setLoading(true);
      try {
        const url = `https://g.tenor.com/v1/search?q=${encodeURIComponent(effectiveQuery)}&key=${TENOR_KEY}&limit=48&searchfilter=sticker`;
        const res = await fetch(url);
        const data = await res.json();
        if (!isMounted) return;

        const normalized: StickerItem[] = (data?.results || [])
          .map((item: any) => {
            const media = item?.media?.[0];
            const stickerUrl = media?.tinygif?.url || media?.gif?.url || media?.nanogif?.url;
            if (!stickerUrl) return null;
            return {
              id: String(item.id || Math.random()),
              name: String(item.content_description || item.title || 'Sticker'),
              url: stickerUrl,
              source: 'tenor' as const,
            };
          })
          .filter(Boolean) as StickerItem[];

        setRemoteStickers(normalized);
      } catch (error) {
        console.error('Failed to load sticker library:', error);
        if (isMounted) setRemoteStickers([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const timer = setTimeout(fetchRemoteStickers, 350);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [activeLibrary, query]);

  const stickers = remoteStickers;

  return (
    <div
      className="w-[22rem] h-[26rem] bg-white dark:bg-surface-container-high rounded-2xl shadow-xl border border-outline-variant/20 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-3 border-b border-outline-variant/10 space-y-2">
        <div>
          <p className="text-[13px] font-bold text-on-surface">Sticker Library</p>
          <p className="text-[11px] text-on-surface-variant">Nhiều thư viện sticker: Cute, Meme, Anime, Việt Nam</p>
        </div>

        <div className="flex bg-surface-container-low rounded-xl px-3 py-2 items-center gap-2 border border-outline-variant/10 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
          <Search size={15} className="text-on-surface-variant" />
          <input
            className="bg-transparent border-none outline-none flex-1 text-[13px] font-medium text-on-surface placeholder:text-on-surface-variant/50"
            placeholder="Tìm sticker theo từ khóa..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="px-2 py-2 border-b border-outline-variant/10 bg-surface-container/20">
        <div className="flex gap-1 overflow-x-auto hide-scrollbar">
          {LIBRARY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveLibrary(tab.id)}
              className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border ${activeLibrary === tab.id ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-surface-container border-outline-variant/20 text-on-surface-variant hover:text-primary hover:border-primary/35'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 bg-surface-container/30">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/60 gap-2">
            <Loader2 size={24} className="animate-spin text-primary" />
            <span className="text-xs font-medium">Đang tải thư viện sticker...</span>
          </div>
        ) : stickers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[12px] text-on-surface-variant">Không có sticker phù hợp, thử từ khóa khác.</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {stickers.map((sticker) => (
              <button
                key={`${sticker.source || 'unknown'}-${sticker.id}`}
                onClick={() => onSelect(sticker)}
                className="h-20 rounded-xl bg-white dark:bg-surface-container border border-outline-variant/15 hover:border-primary/35 hover:bg-primary/5 transition-all flex items-center justify-center active:scale-95"
                title={sticker.name}
                type="button"
              >
                <img src={sticker.url} alt={sticker.name} className="w-14 h-14 object-contain" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StickerPicker;
