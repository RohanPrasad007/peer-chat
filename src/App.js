import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

// Import your components
import Home from "./components/Home";
import VideoChat from "./components/VideoChat";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/chat" element={<VideoChat />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </Router>
  );
}

export default App;
