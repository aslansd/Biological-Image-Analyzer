import React, { useState, useEffect, useRef } from 'react';
import { Detection, DetectionCategory } from '../types';
import { Info, Sparkles, Send, Loader2, BookOpen, BrainCircuit } from 'lucide-react';

interface ExplainableAIPanelProps {
  category: DetectionCategory;
  selectedDetection: Detection | null;
  onSendMessage: (question: string) => Promise<string>;
}

export default function ExplainableAIPanel({
  category,
  selectedDetection,
  onSendMessage
}: ExplainableAIPanelProps) {
  const [messages, setMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Clear or populate chat when active detection changes
  useEffect(() => {
    if (selectedDetection) {
      setMessages([
        {
          sender: 'ai',
          text: `🔬 **Explainable AI Insights for ${selectedDetection.label}**\n\n**Visual Parameters Detected:**\n* **Category**: ${category.toUpperCase()}\n* **Type**: ${selectedDetection.type}\n* **Area**: ${selectedDetection.attributes.area || 'N/A'} µm²\n* **Confidence**: ${Math.round(selectedDetection.confidence * 100)}%\n* **Status**: ${selectedDetection.attributes.status?.toUpperCase() || 'NORMAL'}\n\n**Diagnostic Rationale:**\n${selectedDetection.explanation}\n\n*You can ask me specific questions about this detection's morphology, clinical implications, or ask for recommended filters (e.g., deconvolution).*`
        }
      ]);
    } else {
      setMessages([
        {
          sender: 'ai',
          text: `👋 **Welcome to the Explainable AI Microscopy Assistant.**\n\nTo begin, **click on any detected structure / cell** on the microscope view or select one from the Quantitative Workspace. I will immediately analyze its structural boundaries and provide a full physiological explanation.`
        }
      ]);
    }
  }, [selectedDetection, category]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userMsg = inputText;
    setInputText('');
    setMessages((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const aiReply = await onSendMessage(userMsg);
      setMessages((prev) => [...prev, { sender: 'ai', text: aiReply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { sender: 'ai', text: '⚠️ Failed to connect to AI analysis servers. Please try again.' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-purple-400" />
          Explainable AI Assistant
        </h3>
        <span className="text-[10px] bg-purple-950/80 text-purple-300 font-mono px-2 py-0.5 rounded border border-purple-900/40 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-purple-400" />
          Powered by Gemini
        </span>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-zinc-950/25 scrollbar-thin scrollbar-thumb-zinc-800"
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col max-w-[90%] rounded-xl p-3 text-xs leading-relaxed ${
              msg.sender === 'user'
                ? 'bg-purple-600 text-white ml-auto rounded-tr-none'
                : 'bg-zinc-950 text-zinc-300 mr-auto rounded-tl-none border border-zinc-800/80'
            }`}
          >
            {msg.sender === 'ai' ? (
              <div className="space-y-2 whitespace-pre-wrap font-sans">
                {/* Parse manual basic markdown bullets & bolding */}
                {msg.text.split('\n').map((line, idx) => {
                  let parsedLine = line;
                  let isHeading = line.startsWith('###');
                  let isBullet = line.startsWith('*') || line.startsWith('-');
                  
                  if (isHeading) {
                    parsedLine = line.replace('###', '').trim();
                    return <h4 key={idx} className="font-bold text-zinc-100 text-[11px] uppercase tracking-wider mt-2 mb-1">{parsedLine}</h4>;
                  }
                  
                  if (isBullet) {
                    parsedLine = line.substring(1).trim();
                    // Basic bolding handler **test**
                    const parts = parsedLine.split('**');
                    return (
                      <div key={idx} className="flex gap-1.5 ml-2">
                        <span className="text-purple-400 font-bold">•</span>
                        <span>
                          {parts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="text-white font-semibold">{part}</strong> : part)}
                        </span>
                      </div>
                    );
                  }

                  const parts = line.split('**');
                  return (
                    <p key={idx}>
                      {parts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="text-white font-semibold">{part}</strong> : part)}
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="font-sans">{msg.text}</p>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center gap-2 max-w-[80%] rounded-tl-none mr-auto">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
            <span className="text-[11px] text-zinc-400 font-mono">Synthesizing clinical rationale...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 bg-zinc-950 border-t border-zinc-800 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={selectedDetection ? "Ask about this cell's morphology..." : "Select a cell/structure to query..."}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition font-sans"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isLoading}
          className={`px-3 py-1.5 rounded-lg flex items-center justify-center transition-colors ${
            inputText.trim() && !isLoading
              ? 'bg-purple-600 hover:bg-purple-500 text-white'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
