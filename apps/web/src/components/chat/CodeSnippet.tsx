import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeSnippetProps {
  code: string;
  language?: string;
  filename?: string;
}

const CodeSnippet: React.FC<CodeSnippetProps> = ({ code, language, filename }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLanguage = (language || "javascript").toLowerCase();
  const displayTitle = filename || `Snippet · ${displayLanguage.toUpperCase()}`;

  return (
    <div className="my-4 rounded-2xl overflow-hidden border border-white/10 bg-[#1e1e1e] font-mono shadow-2xl animate-in fade-in zoom-in duration-500 w-full min-w-[280px] md:min-w-[450px]">
      <style>{`
        /* Custom scrollbar for syntax highlighter */
        .code-container pre::-webkit-scrollbar {
          height: 8px;
          width: 8px;
        }
        .code-container pre::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .code-container pre::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .code-container pre::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>

      {/* Header Bar */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-[#252526] border-b border-white/5 select-none">
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-sm shadow-[#ff5f56]/20" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-sm shadow-[#ffbd2e]/20" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f] shadow-sm shadow-[#27c93f]/20" />
          </div>
          <div className="h-4 w-[1px] bg-white/10 mx-1" />
          <span className="text-white/40 text-[11px] font-black uppercase tracking-[0.2em]">
            {displayTitle}
          </span>
        </div>
        
        <button
          onClick={handleCopy}
          className={`group flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-300 ${
            copied
              ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
              : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white hover:scale-105 active:scale-95"
          }`}
        >
          {copied ? (
            <>
              <Check size={14} strokeWidth={3} className="animate-in zoom-in duration-300" />
              <span>COPIED!</span>
            </>
          ) : (
            <>
              <Copy size={14} strokeWidth={2.5} className="group-hover:rotate-12 transition-transform" />
              <span>COPY</span>
            </>
          )}
        </button>
      </div>

      {/* Code Area */}
      <div className="code-container relative group/code">
        <SyntaxHighlighter
          language={displayLanguage}
          style={vscDarkPlus}
          showLineNumbers={true}
          lineNumberStyle={{
            minWidth: "3.5em",
            paddingRight: "1em",
            color: "rgba(255, 255, 255, 0.15)",
            textAlign: "right",
            userSelect: "none",
            fontWeight: "bold",
            fontSize: "12px",
          }}
          customStyle={{
            margin: 0,
            padding: "20px 0",
            backgroundColor: "#1e1e1e",
            fontSize: "13px",
            lineHeight: "1.7",
            borderRadius: 0,
            border: "none",
          }}
          codeTagProps={{
            style: {
              fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace)",
            }
          }}
        >
          {code}
        </SyntaxHighlighter>
        
        {/* Subtle glow effect on the left border of the code */}
        <div className="absolute top-0 left-[3.5em] bottom-0 w-[1px] bg-white/5" />
      </div>
    </div>
  );
};

export default CodeSnippet;
