import { Link, useNavigate } from "react-router-dom";
import logo from "../utils/logo.png";
import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const Header = ({ user }) => {
  const navigate = useNavigate();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isGoldMember, setIsGoldMember] = useState(false);

  useEffect(() => {
    const checkGoldStatus = async () => {
      if (user) {
        const docRef = doc(db, "Users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().subscriptionPlan === "Gold") {
          setIsGoldMember(true);
        }
      }
    };
    checkGoldStatus();
  }, [user]);

  const handleNavigation = (path) => {
    setIsTransitioning(true);
    setTimeout(() => {
      navigate(path);
      setIsTransitioning(false);
    }, 300);
  };

  const handleAboutContact = (sectionId) => {
    const currentPath = window.location.pathname;
    if (currentPath !== "/") {
      navigate("/", { state: { scrollTo: sectionId } });
    } else {
      scrollToSection(sectionId);
    }
  };

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = 160;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition =
        elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };
  const [prevScrollPos, setPrevScrollPos] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollPos = window.scrollY;
      setVisible(prevScrollPos > currentScrollPos || currentScrollPos < 10);
      setPrevScrollPos(currentScrollPos);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [prevScrollPos]);

  return (
    <div
      className={`h-40 px-8 fixed w-full z-50 transition-transform duration-300 
      bg-white/50 backdrop-blur-lg
      ${visible ? "translate-y-0" : "-translate-y-full"}`}
    >
      <div className="max-w-7xl mx-auto h-full flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Link to="/" className="flex items-center">
            <img
              className="w-24 h-24 mt-10 mb-4"
              src={logo}
              alt="Customer Churn Prediction Logo"
            />
            <div className="ml-3 mt-10 mb-4">
              <h1 className="text-3xl font-bold text-[#1d5a7b] leading-tight">
                Customer Churn
              </h1>
              <p className="text-base text-gray-600">AI Prediction</p>
            </div>
          </Link>
        </div>

        <nav className="h-full mt-10 mb-4">
          <ul className="flex items-center h-full space-x-12">
            <li>
              <button
                onClick={() => {
                  scrollToTop();
                  handleNavigation("/");
                }}
                className={`text-xl hover:text-[#1d5a7b] hover:text-[22px] font-medium 
                  transition-all duration-300 hover:scale-105 inline-block
                  ${
                    isTransitioning
                      ? "opacity-0 transform scale-95"
                      : "opacity-100 transform scale-100"
                  }`}
              >
                Home
              </button>
            </li>
            <li>
              <button
                onClick={() => handleAboutContact("about-section")}
                className="text-xl hover:text-[#1d5a7b] hover:text-[22px] font-medium 
                  transition-all duration-300 hover:scale-105 inline-block"
              >
                About
              </button>
            </li>
            <li>
              <button
                onClick={() => handleAboutContact("contact-section")}
                className="text-xl hover:text-[#1d5a7b] hover:text-[22px] font-medium 
                  transition-all duration-300 hover:scale-105 inline-block"
              >
                Contact
              </button>
            </li>
            <li>
              {user ? (
                <button
                  onClick={() => handleNavigation("/Account")}
                  className={`bg-[#1d5a7b] text-white px-5 py-2 rounded-full
                    hover:bg-[#164e68] transition-all duration-300 hover:scale-105
                    text-xl hover:text-[22px] font-medium shadow-md hover:shadow-lg
                    ${isTransitioning ? "opacity-0 transform scale-95" : "opacity-100 transform scale-100"}`}
                >
                  Account
                </button>
              ) : (
                <button
                  onClick={() => handleNavigation("/login")}
                  className={`bg-[#1d5a7b] text-white px-5 py-2 rounded-full
                    hover:bg-[#164e68] transition-all duration-300 hover:scale-105
                    text-xl hover:text-[22px] font-medium shadow-md hover:shadow-lg
                    ${isTransitioning ? "opacity-0 transform scale-95" : "opacity-100 transform scale-100"}`}
                >
                  Login
                </button>
              )}
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
};

export default Header;
