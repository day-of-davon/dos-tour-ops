import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./DosApp.jsx";
import AuthGate from "./components/AuthGate.jsx";
import { storage, getShared, setShared, deleteShared, getPrivate, setPrivate, deletePrivate, isSharedKey } from "./lib/storage";

window.storage = {
  get: (k) => isSharedKey(k) ? getShared(k) : storage.get(k),
  set: (k, v) => isSharedKey(k) ? setShared(k, v) : storage.set(k, v),
  delete: (k) => isSharedKey(k) ? deleteShared(k) : storage.delete(k),
  getShared, setShared, deleteShared,
  getPrivate, setPrivate, deletePrivate,
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthGate><App /></AuthGate>
  </StrictMode>
);
