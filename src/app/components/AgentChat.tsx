"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ToolEvent {
  timestamp: number;
  tool: string;
  action: string;
  details?: string;
}

export default function AgentChat() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<ToolEvent[]>([]);
  const [input, setInput] = useState("");
  const [activeTools, setActiveTools] = useState({
    browser: false,
    calculator: false,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, events]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMessage = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsProcessing(true);
    setEvents([]);

    try {
      // Create URLSearchParams with the request data
      const params = new URLSearchParams({
        objective: userMessage,
        activeTools: JSON.stringify(activeTools),
      });

      // Create EventSource for SSE
      const eventSource = new EventSource(`/api/agent?${params.toString()}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "event":
            setEvents((prev) => [...prev, data.data]);
            break;
          case "completion":
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: data.data },
            ]);
            eventSource.close();
            setIsProcessing(false);
            break;
          case "error":
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: "Sorry, I encountered an error. Please try again.",
              },
            ]);
            eventSource.close();
            setIsProcessing(false);
            break;
        }
      };

      eventSource.onerror = () => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sorry, I encountered an error. Please try again.",
          },
        ]);
        eventSource.close();
        setIsProcessing(false);
      };
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
      setIsProcessing(false);
    }
  };

  const handleToolToggle = (tool: "browser" | "calculator") => {
    setActiveTools((prev) => ({
      ...prev,
      [tool]: !prev[tool],
    }));
  };

  return (
    <div className="absolute inset-0 flex">
      {/* Chat section */}
      <div className="flex-1 flex flex-col border-r">
        {/* Messages container */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-[800px] mx-auto space-y-4">
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
          <div className="max-w-[800px] mx-auto">
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
                onClick={() => handleToolToggle("browser")}
                className={`hover:bg-blue-100 rounded-full p-2 group relative ${
                  activeTools.browser
                    ? "bg-blue-100 text-blue-500"
                    : "text-gray-500"
                }`}
                title="Agentic browser"
              >
                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  Agentic browser{" "}
                  {activeTools.browser ? "(active)" : "(inactive)"}
                </span>
                <svg
                  className={`w-4 h-4 transition-all duration-300 ${
                    activeTools.browser ? "rotate-180" : ""
                  }`}
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
                onClick={() => handleToolToggle("calculator")}
                className={`hover:bg-blue-100 rounded-full p-2 group relative ${
                  activeTools.calculator
                    ? "bg-blue-100 text-blue-500"
                    : "text-gray-500"
                }`}
                title="Test echo"
              >
                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  Calculator{" "}
                  {activeTools.calculator ? "(active)" : "(inactive)"}
                </span>
                <svg
                  className="w-4 h-4"
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

      {/* Events panel */}
      <div className="w-[400px] flex flex-col bg-gray-50">
        <div className="p-4 border-b bg-white">
          <h2 className="text-lg font-semibold text-gray-700">Tool Events</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {events.length === 0 && !isProcessing && (
              <div className="text-center text-gray-500 py-8">
                No events yet
              </div>
            )}
            {events.map((event, index) => (
              <div
                key={index}
                className="bg-white rounded-lg p-3 shadow-sm border border-gray-100"
              >
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-sm font-medium text-blue-600">
                    {event.tool}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-sm text-gray-600">{event.action}</div>
                {event.details && (
                  <div className="mt-1 text-xs text-gray-500 break-words">
                    {event.details}
                  </div>
                )}
              </div>
            ))}
            {isProcessing && (
              <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse [animation-delay:0.2s]" />
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={eventsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
