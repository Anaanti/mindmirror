import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

import MainApp from "./MainApp";
import LoginPage from "./LoginPage";
console.log("useAuth test:", useAuth);
function App() {
  const { user } = useAuth();

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={user ? "/dashboard" : "/login"} />}
        />
        <Route
          path="/login"
          element={!user ? <LoginPage /> : <Navigate to="/dashboard" />}
        />
        <Route
          path="/dashboard"
          element={user ? <MainApp /> : <Navigate to="/login" />}
        />
      </Routes>
    </Router>
  );
}

export default App;
