import { Link, useNavigate, useLocation } from "react-router-dom";
import hero from "../utils/herosection.svg";
import useOnlineStatus from "../utils/useOnlineStatus";
import { useRef, useState, useEffect } from "react";
import Aboutp from "./Aboutp";
import Contact from "./Contact";

export const Body = () => {
  const OnlineStatus = useOnlineStatus();
  const aboutSectionRef = useRef(null);
  const contactSectionRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (location.state?.scrollTo) {
      setTimeout(() => {
        scrollToSection(
          location.state.scrollTo === "about-section"
            ? aboutSectionRef
            : contactSectionRef
        );
      }, 100);
    }
  }, [location]);

  const scrollToSection = (ref) => {
    if (ref.current) {
      const headerOffset = 80;
      const elementPosition = ref.current.getBoundingClientRect().top;
      const windowHeight = window.innerHeight;
      const elementHeight = ref.current.offsetHeight;
      const offsetPosition =
        window.pageYOffset +
        elementPosition -
        (windowHeight - elementHeight) / 2;

      window.scrollTo({
        top: Math.max(0, offsetPosition),
        behavior: "smooth",
      });
    }
  };

  if (OnlineStatus === false)
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center p-8 bg-red-50 rounded-lg shadow-md">
          <h1 className="text-xl text-red-600 font-semibold">
            You are offline! Please check your internet connection.
          </h1>
        </div>
      </div>
    );

  return (
    <div className="relative pt-24">
      {/* Hero Section */}
      <div className="min-h-screen flex flex-col relative bg-white">
        <div className="max-w-7xl mx-auto px-4 flex-grow flex items-center">
          <div className="flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="md:w-1/2 space-y-8">
              <h1 className="font-serif text-5xl font-bold text-[#1d5a7b] leading-tight animate-fade-in">
                Predict Customer Behavior
                <span className="block text-3xl mt-2 text-gray-600 font-normal">
                  Before They Leave
                </span>
              </h1>

              <p className="text-xl text-gray-600 max-w-md">
                Use AI-powered analytics to identify customers at risk of
                churning and take proactive measures to retain them.
              </p>

              <div className="flex gap-6">
                <button
                  onClick={() => {
                    setIsTransitioning(true);
                    setTimeout(() => {
                      navigate("/Prediction");
                    }, 300);
                  }}
                  className={`rounded-full bg-[#1d5a7b] hover:bg-[#164e68] font-semibold
                    px-8 py-4 shadow-lg transition-all text-white
                    hover:scale-105 hover:shadow-xl duration-300 ease-in-out
                    ${
                      isTransitioning
                        ? "opacity-0 transform scale-95"
                        : "opacity-100 transform scale-100"
                    }`}
                >
                  Get Started
                </button>
                <button
                  onClick={() => scrollToSection(aboutSectionRef)}
                  className="rounded-full bg-white border-2 border-[#1d5a7b] font-semibold
                    px-8 py-4 shadow-lg transition-all text-[#1d5a7b]
                    hover:scale-105 hover:shadow-xl duration-300 ease-in-out"
                >
                  Learn More
                </button>
              </div>
            </div>

            <div className="md:w-1/2 flex flex-col items-center">
              <img
                src={hero}
                alt="Data Analysis Visualization"
                className="w-full max-w-lg transform hover:scale-105 transition-transform duration-500 ease-in-out"
              />
            </div>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div id="about-section" ref={aboutSectionRef} className="scroll-mt-20">
        <Aboutp />
      </div>

      {/* Contact Section */}
      <div
        id="contact-section"
        ref={contactSectionRef}
        className="scroll-mt-20"
      >
        <Contact />
      </div>
    </div>
  );
};

export default Body;
