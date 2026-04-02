import { useState, useRef, useEffect, useCallback } from "react";
import ChatHeader from "@/components/ChatHeader";
import ChatMessage, { Message } from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import QuickActions from "@/components/QuickActions";
import TypingIndicator from "@/components/TypingIndicator";
import { postChat } from "@/lib/chatApi";
import { escapeHtml, markdownToSafeHtml } from "@/lib/markdown";

const welcomeMessage: Message = {
  id: "welcome",
  role: "agent",
  content: `<strong>🛡️ Welcome to ArbiGuard</strong><br/><br/>I'm your DeFi threat detection agent monitoring the <em>Arbitrum</em> network. I can help you with:<br/><ul><li>Real-time threat analysis & alerts</li><li>Historical exploit replays & breakdowns</li><li>Protocol health monitoring</li><li>Smart contract status checks</li></ul><br/>Use the quick actions below or type a question — responses are powered by the ArbiGuard server and OpenAI when needed.`,
  timestamp: new Date(),
};

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [isTyping, setIsTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: escapeHtml(trimmed).replace(/\n/g, "<br/>"),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const { response } = await postChat(trimmed);
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "agent",
        content: markdownToSafeHtml(response),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "agent",
        content: `<strong>Could not reach ArbiGuard</strong><br/><br/>${escapeHtml(msg)}<br/><br/>Make sure the API server is running (<code>pnpm dev</code> in the repo root on port 3000) and that the Vite dev proxy targets it.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <ChatHeader />
      <div
        ref={chatRef}
        className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4 scrollbar-thin"
      >
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isTyping && <TypingIndicator />}
      </div>
      <QuickActions onAction={handleSend} />
      <ChatInput onSend={handleSend} disabled={isTyping} />
    </div>
  );
};

export default Index;
