import AgentChat from "./components/AgentChat";

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8 flex flex-col">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Web Automation Assistant</h1>
        <p className="text-gray-600">
          Ask me to perform tasks on the web. I can navigate websites, interact
          with pages, and help you find information.
        </p>
      </header>

      <div className="flex-1 min-h-[70vh]">
        <AgentChat />
      </div>
    </main>
  );
}
