import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
// HashRouter keeps the route after a "#" (e.g. /#/admin/upload). A static host such as GitHub Pages
// cannot send deep links like /admin/upload to index.html, so refreshing one would 404 with BrowserRouter.
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { api, getSession, setOnAuthLost, setSession } from "./api.js";
import Login from "./pages/Login.jsx";
import Catalog from "./pages/Catalog.jsx";
import { AdminLayout, AdminClients, AdminClient, AdminContracts, AdminAudit, AdminBuckets } from "./pages/Admin.jsx";
import AdminUpload from "./pages/Upload.jsx";
import "./styles.css";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [session, setS] = useState(getSession);

  const logout = useCallback(() => { setSession(null); setS(null); }, []);
  useEffect(() => setOnAuthLost(logout), [logout]);

  const login = useCallback(async (email, password) => {
    const d = await api("/dpr-auth/login", { method: "POST", body: { email, password }, auth: false });
    const s = { token: d.id_token, user: d.user };
    setSession(s); setS(s);
    return s;
  }, []);

  const value = useMemo(() => ({
    session, user: session?.user, isAdmin: session?.user?.role === "admin", login, logout,
  }), [session, login, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function Guard({ admin, children }) {
  const { session, isAdmin } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  if (!admin && isAdmin) return <Navigate to="/admin" replace />;
  return children;
}

createRoot(document.getElementById("root")).render(
  <HashRouter>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Guard><Catalog /></Guard>} />
        <Route path="/admin" element={<Guard admin><AdminLayout /></Guard>}>
          <Route index element={<AdminClients />} />
          <Route path="clients/:orgId" element={<AdminClient />} />
          <Route path="contracts" element={<AdminContracts />} />
          <Route path="upload" element={<AdminUpload />} />
        <Route path="audit" element={<AdminAudit />} />
          <Route path="buckets" element={<AdminBuckets />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  </HashRouter>
);
