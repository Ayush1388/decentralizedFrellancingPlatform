import { useState, useEffect } from "react";
import axios from "axios";
import DeveloperCard from "../Components/DeveloperCard";
import NavigationBar from "../Components/NavigationBar";
import Testimonial from "../Components/Testimonial";

export default function HomePage() {
  const [developers, setDevelopers] = useState([]);

  // Fetch developers from backend
  useEffect(() => {
    axios.get("http://localhost:3001/api/developers").then((res) => {
      setDevelopers(res.data);
    });
  }, []);

  const slots = 6; // fixed number of slots

  return (
    <div className="min-h-screen mx-50 ">
      {/* Hero Section */}
      <div className="flex py-10 justify-between">
        <div className="w-1/2 py-8">
          <h2 className="text-6xl font-bold leading-tight mb-6">
            Hire Developers, <span className="text-green-600">Pay in Crypto</span>
          </h2>
          <p>
            A global freelancing platform built for the future. Find developers,
            manage projects, and make borderless payments.
          </p>
          <button className="border-white shadow-2xl py-2 mt-8 px-4 text-white hover:bg-green-700 font-sans font-semibold bg-green-600 rounded-full">
            Hire Now
          </button>
        </div>
        <img
          src="/Working remotely-bro.png"
          alt="Logo"
          className="w-100 h-100"
        />
      </div>

      {/* Developers Section */}
      <h2 className="font-bold text-2xl mt-10">Developers</h2>
      <div className="flex flex-wrap gap-4 py-2">
        {Array.from({ length: slots }).map((_, i) =>
          developers[i] ? (
            <DeveloperCard key={i} dev={developers[i]} />
          ) : (
            <div
              key={i}
              className="flex items-center justify-center border-2 border-dashed rounded-2xl w-80 h-64 text-gray-400"
            >
              Empty Slot
            </div>
          )
        )}
      </div>

      {/* How It Works Section */}
      <h2 className="text-center font-bold text-4xl mt-10">How It Works</h2>
      <div className="flex flex-col gap-2">
        <div className="shadow-md flex rounded-xl py-4 px-12 h-65">
          <img className="w-60 h-60" src="/Work time-cuate.svg" />
          <div className="mr-2 mt-6 ml-12">
            <h2 className="text-2xl font-bold my-4">Post Your Project</h2>
            <p className="text-gray-500">
              Tell us what you need. Write a short project description, select
              required skills, and set your budget in crypto.
            </p>
          </div>
          <img className="w-64 h-64 mr-10" src="/Hired-cuate.svg" />
        </div>

        <div className="shadow-md h-65 flex rounded-xl py-4 px-12">
          <img className="w-60 h-60" src="/Co-workers-cuate.svg" />
          <div className="mr-0 mt-6 ml-12">
            <h2 className="text-2xl font-bold my-4">Hire the Right Developer</h2>
            <p className="text-gray-500 mr-20">
              Browse verified Web3 developers, check their profiles, past work,
              and reviews. Choose the perfect match for your project.
            </p>
          </div>
        </div>

        <div className="shadow-md h-65 flex rounded-xl py-4 px-12">
          <div className="mt-6 mr-10">
            <h2 className="text-2xl font-bold my-4">Pay Securely in Crypto</h2>
            <p className="text-gray-500 mr-20">
              Work with confidence. Funds are held securely and released only
              when milestones are completed, powered by blockchain escrow.
            </p>
          </div>
          <img className="w-60 h-60 mr-10" src="/Freelancer-cuate.svg" />
        </div>
      </div>

      {/* Testimonials Section */}
      <h2 className="text-center font-bold text-4xl my-10">Testimonial</h2>
      <h2 className="text-center text-3xl text-gray-500 mt-5">
        Trusted by founders, startups, and Web3 teams worldwide.
      </h2>
      <div className="flex justify-center">
        <button className="px-4 py-2 bg-green-500 mt-4 rounded-full text-white font-sans">
          Know more
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mt-10">
        <Testimonial />
        <Testimonial />
        <Testimonial />
        <Testimonial />
        <Testimonial />
        <Testimonial />
      </div>
    </div>
  );
}
