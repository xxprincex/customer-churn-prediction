import React from "react";
import ReactDOM from "react-dom/client";
import "../style.css";
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
import "react-toastify/dist/ReactToastify.css";
import { useEffect, useState } from "react";
import { auth } from "./firebase";
import Account from "./components/Account";
import PredictionDetail from "./components/PredictionDetail";
import CsvUpload from "./components/CsvUpload";
import { AnimatePresence } from "framer-motion";
import BatchPredictionDetail from "./components/BatchPredictionDetail";

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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1d5a7b]"></div>
      </div>
    );
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
      <AnimatePresence mode="wait">
        <Outlet />
      </AnimatePresence>
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
        {
          path: "/batch-prediction-detail/:id",
          element: (
            <ProtectedRoute user={user}>
              <BatchPredictionDetail />
            </ProtectedRoute>
          ),
        },
      ],
      errorElement: <Error />,
    },
  ], {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true
    }
  });

// Create root only if it doesn't exist
let root;
if (!window.__REACT_ROOT__) {
  root = ReactDOM.createRoot(document.getElementById("root"));
  window.__REACT_ROOT__ = root;
} else {
  root = window.__REACT_ROOT__;
}

// Render the app
root.render(
  <React.StrictMode>
    <AuthProvider>
      {(user) => <RouterProvider router={appRouter(user)} />}
    </AuthProvider>
  </React.StrictMode>
);
