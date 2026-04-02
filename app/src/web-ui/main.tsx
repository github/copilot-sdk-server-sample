import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ChatPage from "./ChatPage";
import SessionNotFoundPage from "./SessionNotFoundPage";
import "./index.css";

const root = document.getElementById("root")!;
createRoot(root).render(
  <BrowserRouter>
    <Routes>
      <Route path="/sessions/not-found" element={<SessionNotFoundPage />} />
      <Route path="/sessions/:sessionId" element={<ChatPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);
