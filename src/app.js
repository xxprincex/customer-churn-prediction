import React from "react";
import ReactDOM from "react-dom/client";
import Header from "./components/Header";
import Body from "./components/Body";
import Aboutp from "./components/Aboutp";
import Contact from "./components/Contact";
import Error from "./components/Error";
import Prediction from "./components/Prediction";
import Register from "./components/Register";
import Login from "./components/Login";
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  Navigate,
} from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { useEffect, useState } from "react";
import { auth } from "./components/firebase";
import Account from "./components/Account";
import PredictionDetail from "./components/PredictionDetail";
import CsvUpload from "./components/CsvUpload";

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <p className="text-xl flex justify-center mt-95">loading....</p>;
  }
  return children(user);
};

const ProtectedRoute = ({ user, children }) => {
  if (user === null) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const AuthRoute = ({ user, children }) => {
  if (user) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const AppLayout = ({ user }) => {
  return (
    <div className="app">
      <Header user={user} />
      <Outlet />
      <ToastContainer />
    </div>
  );
};

const appRouter = (user) =>
  createBrowserRouter([
    {
      path: "/",
      element: <AppLayout user={user} />,
      children: [
        {
          path: "/",
          element: <Body />,
        },
        {
          path: "/aboutp",
          element: <Aboutp />,
        },
        {
          path: "/contact",
          element: <Contact />,
        },
        {
          path: "/prediction",
          element: (
            <ProtectedRoute user={user}>
              <Prediction />
            </ProtectedRoute>
          ),
        },
        {
          path: "/register",
          element: (
            <AuthRoute user={user}>
              <Register />
            </AuthRoute>
          ),
        },
        {
          path: "/login",
          element: (
            <AuthRoute user={user}>
              <Login />
            </AuthRoute>
          ),
        },
        {
          path: "/account",
          element: (
            <ProtectedRoute user={user}>
              <Account />
            </ProtectedRoute>
          ),
        },
        {
          path: "/prediction-detail/:predictionId",
          element: (
            <ProtectedRoute user={user}>
              <PredictionDetail />
            </ProtectedRoute>
          ),
        },
        {
          path: "/csv-upload",
          element: (
            <ProtectedRoute user={user}>
              <CsvUpload />
            </ProtectedRoute>
          ),
        },
      ],
      errorElement: <Error />,
    },
  ]);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <AuthProvider>
    {(user) => <RouterProvider router={appRouter(user)} />}
  </AuthProvider>
);
