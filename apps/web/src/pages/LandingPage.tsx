import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

// --- STYLED COMPONENTS ---

const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <nav className="fixed top-8 left-1/2 -translate-x-1/2 w-[90%] max-w-7xl z-50 liquid-glass-strong rounded-full px-8 py-4 flex justify-between items-center animate-fade-in shadow-2xl">
      <Link to="/" className="flex items-center gap-3">
        <img src="/logo_blue.png" alt="Logo" className="w-10 h-10 object-contain" />
        <span className="text-2xl font-black tracking-tighter text-primary font-heading italic">
          Zalo Education<sup className="text-[10px] font-normal not-italic ml-0.5">®</sup>
        </span>
      </Link>

      <div className="hidden md:flex items-center gap-10">
        <a href="#features" className="text-sm font-bold text-primary hover:opacity-70 transition-opacity font-body uppercase tracking-widest">Tính năng</a>
        <a href="#about" className="text-sm font-bold text-secondary hover:text-primary transition-colors font-body uppercase tracking-widest">Giới thiệu</a>
        <a href="#" className="text-sm font-bold text-secondary hover:text-primary transition-colors font-body uppercase tracking-widest">Tài liệu</a>
        <button 
          onClick={() => navigate(user ? '/chat' : '/login')}
          className="px-8 py-3 bg-primary text-white rounded-full font-black text-sm hover:scale-105 active:scale-95 transition-all shadow-xl font-body"
        >
          {user ? 'Vào ứng dụng' : 'Đăng nhập'}
        </button>
      </div>
    </nav>
  );
};

const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let frameId: number;
    const checkTime = () => {
      const { currentTime, duration } = video;
      if (duration) {
        // Fade in logic (first 0.5s)
        if (currentTime < 0.5) {
          setOpacity(currentTime / 0.5);
        } 
        // Fade out logic (last 0.5s)
        else if (currentTime > duration - 0.5) {
          setOpacity((duration - currentTime) / 0.5);
        } 
        // Steady state
        else {
          setOpacity(1);
        }
      }
      frameId = requestAnimationFrame(checkTime);
    };

    video.play();
    frameId = requestAnimationFrame(checkTime);

    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleEnded = () => {
    const video = videoRef.current;
    if (!video) return;
    setOpacity(0);
    setTimeout(() => {
      video.currentTime = 0;
      video.play();
    }, 100);
  };

  return (
    <section className="relative h-screen w-full flex items-center justify-center text-center px-6 overflow-hidden bg-white">
      {/* Cinematic Video Background */}
      <div className="absolute inset-0 z-0 bg-white">
        <video
          ref={videoRef}
          onEnded={handleEnded}
          muted
          playsInline
          className="w-full h-full object-cover pointer-events-none"
          style={{ opacity, transition: 'opacity 0.1s linear' }}
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4"
        />
        {/* Gradients to blend video */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-white/40" />
        <div className="absolute inset-0 bg-white/5" />
      </div>

      <div className="relative z-10 max-w-7xl pt-20 text-primary">
        <motion.div
           initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
           whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
           transition={{ duration: 1, ease: 'easeOut' }}
           viewport={{ once: true }}
        >
          <h1 className="text-6xl md:text-9xl font-normal tracking-tight font-heading leading-[0.9] mb-12">
            Invisible <span className="text-secondary italic">technology.</span><br />
            Infinite <span className="text-secondary italic">wisdom.</span>
          </h1>
          <p className="text-lg md:text-xl text-secondary font-body max-w-2xl mx-auto mb-16 leading-relaxed">
            Học tập Không giới hạn hướng tới Tương lai. Zalo Education mang đến giải pháp OTT chuyên nghiệp, an toàn và bảo mật tuyệt đối cho mọi tâm hồn học thuật.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <button 
              onClick={() => navigate(user ? '/chat' : '/login')}
              className="bg-primary text-white px-14 py-5 rounded-full font-bold text-lg hover:scale-105 transition-all shadow-2xl active:scale-95"
            >
              {user ? 'Truy cập trò chuyện' : 'Sử dụng ngay'}
            </button>
            <button 
              onClick={() => navigate(user ? '/profile' : '/register')}
              className="text-primary font-bold text-lg hover:opacity-70 transition-opacity"
            >
              {user ? 'Quản lý tài khoản' : 'Khám phá thế giới'}
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const FeatureChess: React.FC = () => {
  const features = [
    {
      title: "Đăng nhập Một chạm",
      highlight: "QR Code",
      desc: "Xác thực nhanh chóng bằng mã QR từ điện thoại, loại bỏ gánh nặng ghi nhớ mật khẩu. Bảo mật đa tầng, tiện lợi tối đa cho giảng viên và học viên.",
      visual: "/4731-179738656_medium.mp4"
    },
    {
      title: "Kết nối Tức thì",
      highlight: "Socket.io",
      desc: "Hệ thống tương tác thời gian thực với độ trễ tối thiểu. Trao đổi tài liệu, thảo luận nhóm và nhận thông báo ngay lập tức trên mọi thiết bị.",
      visual: "/141519-777930387_medium.mp4"
    }
  ];

  return (
    <section id="features" className="py-40 bg-white overflow-hidden px-6">
      <div className="max-w-7xl mx-auto space-y-40">
        {features.map((f, i) => (
          <div key={i} className={`flex flex-col ${i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-20`}>
            <motion.div 
               className="flex-1 space-y-8"
               initial={{ opacity: 0, x: i % 2 === 0 ? -50 : 50 }}
               whileInView={{ opacity: 1, x: 0 }}
               transition={{ duration: 0.8 }}
               viewport={{ once: true, margin: "-100px" }}
            >
              <h3 className="text-4xl md:text-6xl font-heading leading-tight text-primary">
                {f.title}<br />
                <span className="text-secondary italic underline decoration-1 underline-offset-8">({f.highlight})</span>
              </h3>
              <p className="text-lg text-secondary font-body leading-relaxed max-w-lg">
                {f.desc}
              </p>
            </motion.div>
            <motion.div 
               className="flex-1 w-full"
               initial={{ opacity: 0, scale: 0.9 }}
               whileInView={{ opacity: 1, scale: 1 }}
               transition={{ duration: 0.8 }}
               viewport={{ once: true }}
            >
              <div className="liquid-glass-strong rounded-[3rem] p-4 overflow-hidden relative group">
                <video 
                  src={f.visual} 
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full aspect-square md:aspect-video object-cover rounded-[2.5rem] shadow-2xl scale-[1.01]" 
                />
              </div>
            </motion.div>
          </div>
        ))}
      </div>
    </section>
  );
};

const StatsSection: React.FC = () => {
  return (
    <section className="relative py-60 overflow-hidden flex items-center justify-center bg-white">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover saturate-0 opacity-10"
        src="/3160-166338886_medium.mp4"
      />
      <div className="absolute inset-0 bg-white/20" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-6 w-full text-center">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-24">
          {[
            { label: "Bảo mật", val: "AES-256" },
            { label: "Sync", val: "Real-time" },
            { label: "Auth", val: "QR Scan" },
            { label: "User", val: "100k+" }
          ].map((s, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
              className="space-y-4"
            >
              <h4 className="text-xs uppercase tracking-[0.3em] text-secondary font-body">{s.label}</h4>
              <p className="text-3xl md:text-5xl font-heading text-primary italic">{s.val}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const CTASection: React.FC = () => {
  const navigate = useNavigate();
  return (
    <section className="py-60 px-6 text-center bg-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1 }}
        viewport={{ once: true }}
        className="max-w-4xl mx-auto space-y-12"
      >
        <h2 className="text-5xl md:text-8xl font-heading italic leading-tight text-primary">
          Sẵn sàng để bắt đầu<br /> cùng Zalo Education?
        </h2>
        <p className="text-xl text-secondary font-body max-w-xl mx-auto">
          Giao diện tối giản, trải nghiệm tối ưu. Nơi kiến thức được truyền tải một cách thuần khiết nhất.
        </p>
        <div className="pt-8">
           <button 
            onClick={() => navigate('/register')}
            className="px-20 py-6 bg-primary text-white rounded-full font-black text-xl hover:scale-105 transition-all shadow-2xl active:scale-95 font-body"
          >
            Đăng ký tham gia
          </button>
        </div>
      </motion.div>
    </section>
  );
};

// --- MAIN PAGE ---

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-surface text-primary dark:text-on-surface font-body selection:bg-primary selection:text-white">
      <Navbar />
      
      <main>
        <HeroSection />
        
        <FeatureChess />
        
        <StatsSection />
        
        <CTASection />
      </main>

      <footer className="py-20 border-t border-primary/5 font-body bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-4">
            <img src="/logo_blue.png" alt="Logo" className="w-8 h-8 object-contain" />
            <span className="font-heading italic text-xl text-primary">Zalo Education</span>
          </div>
          
          <p className="text-secondary text-sm">
            © 2026 Zalo Education System. Luxury Editorial Refactor.
          </p>
          
          <div className="flex gap-10 text-sm uppercase tracking-widest text-secondary font-bold">
            <a href="#" className="hover:text-primary transition-colors">Bảo mật</a>
            <a href="#" className="hover:text-primary transition-colors">Điều khoản</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
