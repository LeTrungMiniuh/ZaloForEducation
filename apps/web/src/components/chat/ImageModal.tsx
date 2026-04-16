import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';

const ImageModal: React.FC = () => {
  const { previewImage, setPreviewImage } = useChatStore();

  const handleClose = () => setPreviewImage(null);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!previewImage) return;

    try {
      const response = await fetch(previewImage.url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = previewImage.name || 'image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed', err);
      window.open(previewImage.url, '_blank');
    }
  };

  // Close on ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <AnimatePresence>
      {previewImage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 md:p-12"
          onClick={handleClose}
        >
          {/* Toolbar */}
          <div className="absolute top-6 right-6 flex items-center gap-4 z-[210]">
             <button
               onClick={handleDownload}
               className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all active:scale-95 group"
               title="Tải ảnh về máy"
             >
               <Download size={24} className="group-hover:translate-y-0.5 transition-transform" />
             </button>
             <button
               onClick={handleClose}
               className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all active:scale-95"
               title="Đóng (ESC)"
             >
               <X size={24} />
             </button>
          </div>

          {/* Image Container */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative max-w-full max-h-full flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.5)] select-none pointer-events-auto"
              draggable={false}
            />
            
            {/* Filename Indicator (Bottom) */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
              <p className="text-white/60 text-[12px] font-medium tracking-wide">
                {previewImage.name}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ImageModal;
