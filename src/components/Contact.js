import React, { useState, useRef } from "react";
import { FaGithub, FaInstagram, FaEnvelope, FaPhone } from "react-icons/fa";
import { toast } from "react-toastify";
import akanksha from "../utils/akanksha.jpg";
import saloni from "../utils/saloni.jpg";
import prince from "../utils/prince.jpg";
import emailjs from "@emailjs/browser";

// Initialize EmailJS
emailjs.init("vLhNPmxSkph8sxwoo");

const developers = [
  {
    name: "Prince Sharma",
    github: "xxprincex",
    instagram: "x__prince___",
    avatar: prince,
    role: "Developer",
  },
  {
    name: "Akanksha Tamhane",
    github: "aktamhane",
    instagram: "akxnkshah",
    avatar: akanksha,
    role: "Developer",
  },
  {
    name: "Saloni Sharma",
    github: "saloni997",
    instagram: "nand_u8887",
    avatar: saloni,
    role: "Developer",
  },
];

const Contact = () => {
  const form = useRef();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValid, setIsValid] = useState(false); // Overall form validity
  const [errors, setErrors] = useState({
    // State for individual field validity (true=valid, false=invalid, null=not yet validated)
    name: null,
    email: null,
  });

  // Updated validation logic consistent with Validate.js, returns true if valid, false otherwise
  const validateField = (name, value) => {
    if (name === "name") {
      const isNameValid = /^[a-zA-Z\s-'.]+$/.test(value);
      return value.trim() !== "" && isNameValid;
    } else if (name === "email") {
      const isEmailValid = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(value);
      return value.trim() !== "" && isEmailValid;
    }
    return true; // Default to true for fields not validated here (e.g., message)
  };

  // Function to check overall form validity based on boolean error states
  const checkFormValidity = (currentFormData, currentErrors) => {
    return (
      currentFormData.name.trim() &&
      currentFormData.email.trim() &&
      currentFormData.message.trim() &&
      currentErrors.name !== false && // Check if not invalid (null or true is ok)
      currentErrors.email !== false // Check if not invalid (null or true is ok)
    );
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Update form data
    const updatedFormData = {
      ...formData,
      [name]: value,
    };
    setFormData(updatedFormData);

    // Validate the changed field and update errors state with boolean validity
    let updatedErrors = { ...errors };
    if (name === "name" || name === "email") {
      // Reset error state to null if the field is empty, otherwise validate
      updatedErrors[name] =
        value.trim() === "" ? null : validateField(name, value);
      setErrors(updatedErrors);
    }

    // Check and update overall form validity
    setIsValid(checkFormValidity(updatedFormData, updatedErrors));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Re-validate all fields on submit attempt to be sure
    const finalErrors = {
      name: validateField("name", formData.name),
      email: validateField("email", formData.email),
    };
    setErrors(finalErrors);

    const finalValidity = checkFormValidity(formData, finalErrors);
    setIsValid(finalValidity);

    if (!finalValidity) {
      // No toast error, rely on visual cues (red borders)
      return;
    }

    setIsSubmitting(true);
    try {
      // Format the timestamp
      const timestamp = new Date().toLocaleString("en-US", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: "Asia/Kolkata",
      });

      // Format the message with better structure
      const formattedMessage = `
Name: ${formData.name}
Email: ${formData.email}

Message:
${formData.message}

Sent on: ${timestamp}
      `.trim();

      const emailResult = await emailjs.send(
        "service_o8icrwt",
        "template_yqv86yi",
        {
          from_name: formData.name,
          from_email: formData.email,
          message: formattedMessage,
          to_email: "digital.prince.sharma@gmail.com",
          subject: `New Contact Form Submission from ${formData.name}`,
          reply_to: formData.email,
        }
      );

      if (emailResult.status === 200) {
        toast.success("Message sent successfully! We'll get back to you soon.");

        // Clear form and errors
        setFormData({
          name: "",
          email: "",
          message: "",
        });
        setErrors({ name: null, email: null });
        setIsValid(false); // Reset validity
      } else {
        throw new Error("Failed to send email");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error(
        "Failed to send message. Please try again or contact us directly at ps5597010@gmail.com"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="font-serif pt-48">
      {/* Introduction Section */}
      <div className="max-w-4xl mx-auto text-center py-8 px-4">
        <h1 className="text-3xl font-medium mb-4">Meet Our Team</h1>
        <p className="text-lg text-gray-600 mb-8">
          We are a passionate team of developers dedicated to helping businesses
          predict and prevent customer churn through innovative AI solutions.
        </p>
      </div>

      {/* Developers Cards */}
      <div className="flex flex-wrap justify-center gap-8 mb-16">
        {developers.map((dev, index) => (
          <div
            key={index}
            className="flex flex-col items-center p-6 shadow-lg hover:shadow-xl rounded-lg w-72 bg-white transition-all duration-300 transform hover:-translate-y-2"
          >
            <img
              src={dev.avatar}
              alt={dev.name}
              className="w-42 h-42 rounded-full object-cover shadow-md border-4 border-white"
            />
            <h2 className="text-xl font-medium mt-4">{dev.name}</h2>
            <p className="text-[#1d5a7b] mb-4">{dev.role}</p>
            <div className="flex space-x-4 mt-2">
              <a
                href={`https://github.com/${dev.github}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaGithub className="text-3xl hover:text-[#1d5a7b] transition-colors" />
              </a>
              <a
                href={`https://www.instagram.com/${dev.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaInstagram className="text-3xl hover:text-[#1d5a7b] transition-colors" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Contact Section */}
      <div className="py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-medium text-center mb-8">
            Get in Touch
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Contact Info */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <FaEnvelope className="text-2xl text-[#1d5a7b]" />
                <div>
                  <h3 className="font-medium">Email Us</h3>
                  <p className="text-gray-600">
                    digital.prince.sharma@gmail.com
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <FaPhone className="text-2xl text-[#1d5a7b]" />
                <div>
                  <h3 className="font-medium">Call Us</h3>
                  <p className="text-gray-600">+91 9082992858</p>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <form ref={form} onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Your Name"
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-1 ${errors.name === false ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-[#1d5a7b]"}`}
                />
                {/* Error message removed */}
              </div>
              <div>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Your Email"
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-1 ${errors.email === false ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-[#1d5a7b]"}`}
                />
                {/* Error message removed */}
              </div>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                placeholder="Your Message"
                rows="4"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1d5a7b]"
              ></textarea>
              <button
                type="submit"
                disabled={isSubmitting || !isValid} // Disable based on submitting state OR overall validity
                className="w-full bg-[#1d5a7b] text-white py-2 rounded-lg hover:bg-[#164e68] 
                          transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Sending..." : "Send Message"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
