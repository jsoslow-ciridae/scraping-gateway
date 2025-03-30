"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AgentChat() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMessage = input.trim();
    setInput("");
    setIsProcessing(true);

    // Add user message immediately
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective: userMessage }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.result,
          },
        ]);
      } else {
        throw new Error(data.error || "Failed to process request");
      }
    } catch (error) {
      console.error("Error processing message:", error);
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${errorMessage}`,
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Messages container */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-[60%] min-w-[300px] mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              What can I help you with?
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-3 max-w-[80%]">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input form */}
      <div className="border-t bg-white p-4">
        <div className="max-w-[60%] min-w-[300px] mx-auto">
          <form onSubmit={handleSubmit}>
            <div className="flex space-x-4">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything"
                disabled={isProcessing}
                className="flex-1 rounded-lg border p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isProcessing || !input.trim()}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:hover:bg-blue-500"
              >
                Send
              </button>
            </div>
          </form>

          {/* Tool icons */}
          <div className="flex space-x-4 mt-2 pl-2">
            <button
              type="button"
              className="hover:bg-blue-100 rounded-full group relative"
              title="Agentic browser"
            >
              <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Agentic browser
              </span>
              <svg
                className="w-4 h-4 text-gray-500 group-hover:text-blue-500 group-hover:rotate-180 transition-all duration-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                />
              </svg>
            </button>
            <button
              type="button"
              className="hover:bg-blue-100 rounded-full group relative"
              title="Test echo"
            >
              <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Test echo
              </span>
              <svg
                className="w-4 h-4 text-gray-500 group-hover:text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
