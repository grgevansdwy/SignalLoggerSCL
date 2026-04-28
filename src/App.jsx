import { Routes, Route } from "react-router-dom";
import MapView from "./components/MapView";
import Dashboard from "./components/Dashboard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MapView />} />
      <Route path="/device/:deviceId" element={<Dashboard />} />
    </Routes>
  );
}
