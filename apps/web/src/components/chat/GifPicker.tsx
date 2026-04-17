import React, { useState, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface GifPickerProps {
  onSelect: (url: string) => void;
  onClose?: () => void;
}

const GifPicker: React.FC<GifPickerProps> = ({ onSelect }) => {
  const [gifs, setGifs] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchGifs = async () => {
      setLoading(true);
      try {
        const searchQ = query.trim() || 'meme';
        // Tenor API public key for standard usage
        const res = await fetch(`https://g.tenor.com/v1/search?q=${encodeURIComponent(searchQ)}&key=LIVDSRZULELA&limit=24`);
        const data = await res.json();
        if (isMounted) {
          setGifs(data.results || []);
        }
      } catch (e) {
        console.error('Failed to fetch GIFs:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    // Debounce search slightly
    const timer = setTimeout(() => {
      fetchGifs();
    }, 400);
    
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div 
      className="w-72 h-80 bg-white dark:bg-surface-container-high rounded-2xl shadow-xl border border-outline-variant/20 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header Search */}
      <div className="p-3 border-b border-outline-variant/10">
        <div className="flex bg-surface-container-low rounded-xl px-3 py-2 items-center gap-2 border border-outline-variant/10 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
          <Search size={16} className="text-on-surface-variant" />
          <input 
            className="bg-transparent border-none outline-none flex-1 text-[13px] font-medium text-on-surface placeholder:text-on-surface-variant/50"
            placeholder="Tìm kiếm GIF, meme..."
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 bg-surface-container/30">
        {loading && gifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/60 gap-2">
            <Loader2 size={24} className="animate-spin text-primary" />
            <span className="text-xs font-medium">Đang tải chúa tể meme...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {gifs.map(g => (
              <img 
                key={g.id}
                src={g.media[0].tinygif.url} 
                alt="gif"
                className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-80 active:scale-95 transition-all bg-surface-container-low" 
                onClick={() => onSelect(g.media[0].gif.url)} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GifPicker;
